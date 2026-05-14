import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL } from "@yadimon/codex-to-llm";
import type { CoreResponse, RunOptions, StreamEvent } from "@yadimon/codex-to-llm";
import type { Runner, ServerOptions } from "../types.js";

export function createMockRunner(options: ServerOptions): Runner {
  return {
    async runPrompt(prompt, requestOptions = {}) {
      return buildMockCoreResponse(prompt, requestOptions, options);
    },
    async *streamPrompt(prompt, requestOptions = {}) {
      const response = buildMockCoreResponse(prompt, requestOptions, options);
      yield {
        type: "response.started",
        response: {
          id: response.id,
          model: response.model,
          prompt: response.prompt,
          createdAt: response.createdAt
        }
      };
      for (const event of response.raw.events) {
        yield {
          type: "response.raw_event",
          event
        } satisfies StreamEvent;
      }
      yield {
        type: "response.output_text.delta",
        delta: response.content
      };
      yield {
        type: "response.completed",
        response
      };
    }
  };
}

function buildMockCoreResponse(
  prompt: string,
  requestOptions: RunOptions,
  options: ServerOptions
): CoreResponse {
  const model =
    requestOptions.model ||
    options.defaultModel ||
    process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL ||
    DEFAULT_MODEL;
  const content = process.env.CODEX_TO_LLM_SERVER_MOCK_RESPONSE || "mock response";
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(content.length / 4);
  const rawEvents = [
    {
      type: "agent_message_delta",
      item: { text: content }
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: inputTokens,
        cached_input_tokens: 0,
        output_tokens: outputTokens
      }
    }
  ];

  return {
    id: `resp_mock_${randomUUID().replace(/-/g, "")}`,
    model,
    prompt,
    createdAt: Math.floor(Date.now() / 1000),
    content,
    usage: {
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    },
    raw: {
      stderr: "",
      events: rawEvents
    }
  };
}
