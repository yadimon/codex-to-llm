import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL } from "@yadimon/codex-to-llm";
import type { CoreResponse, RunOptions } from "@yadimon/codex-to-llm";
import { createErrorBody, writeSse } from "./http-io.js";
import { SSE_KEEPALIVE_MS, type Runner } from "./types.js";

export function buildOpenAIResponse(result: CoreResponse) {
  return {
    id: result.id || `resp_${randomUUID().replace(/-/g, "")}`,
    object: "response",
    created_at: result.createdAt || Math.floor(Date.now() / 1000),
    status: "completed",
    model: result.model || DEFAULT_MODEL,
    output: [
      {
        id: `msg_${randomUUID().replace(/-/g, "")}`,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: result.content,
            annotations: []
          }
        ]
      }
    ],
    output_text: result.content,
    usage: {
      input_tokens: result.usage?.inputTokens ?? 0,
      input_tokens_details: {
        cached_tokens: result.usage?.cachedInputTokens ?? 0
      },
      output_tokens: result.usage?.outputTokens ?? 0,
      total_tokens: result.usage?.totalTokens ?? 0
    }
  };
}

export function buildModelsResponse(models: string[]) {
  return {
    object: "list",
    data: models.map(model => ({
      id: model,
      object: "model",
      created: 0,
      owned_by: "yadimon"
    }))
  };
}

export async function streamOpenAIResponse(
  request: IncomingMessage,
  response: ServerResponse,
  runner: Runner,
  prompt: string,
  runOptions: RunOptions,
  keepaliveMs: number = SSE_KEEPALIVE_MS
) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  const onClientGone = () => controller.abort(new Error("Client disconnected"));
  request.once("close", onClientGone);
  response.once("close", onClientGone);

  let lastByteAt = Date.now();
  const ping = setInterval(() => {
    if (response.writableEnded) {
      return;
    }
    if (Date.now() - lastByteAt < keepaliveMs) {
      return;
    }
    response.write(": ping\n\n");
    lastByteAt = Date.now();
  }, keepaliveMs);

  let finalResponse;
  let hasError = false;

  const send = async (eventName: string, data: unknown) => {
    await writeSse(response, eventName, data);
    lastByteAt = Date.now();
  };

  try {
    for await (const event of runner.streamPrompt(prompt, {
      ...runOptions,
      signal: controller.signal
    })) {
      if (controller.signal.aborted) {
        break;
      }

      if (event.type === "response.started" && event.response) {
        await send("response.created", {
          id: event.response.id,
          model: event.response.model,
          object: "response",
          status: "in_progress"
        });
        continue;
      }

      if (event.type === "response.output_text.delta") {
        await send("response.output_text.delta", { delta: event.delta });
        continue;
      }

      if (event.type === "response.completed" && event.response) {
        finalResponse = buildOpenAIResponse(event.response);
        await send("response.output_text.done", { text: event.response.content });
        await send("response.completed", finalResponse);
      }
    }
  } catch (error) {
    hasError = true;
    if (!controller.signal.aborted && !response.writableEnded) {
      await send(
        "response.failed",
        createErrorBody("server_error", error instanceof Error ? error.message : String(error))
      );
    }
  } finally {
    clearInterval(ping);
    request.off("close", onClientGone);
    response.off("close", onClientGone);
  }

  if (controller.signal.aborted) {
    return finalResponse;
  }

  if (!hasError && !finalResponse) {
    hasError = true;
    await send(
      "response.failed",
      createErrorBody("server_error", "Runner stream ended without a completed response")
    );
  }

  if (!hasError && !response.writableEnded) {
    response.write("data: [DONE]\n\n");
  }
  if (!response.writableEnded) {
    response.end();
  }

  return finalResponse;
}
