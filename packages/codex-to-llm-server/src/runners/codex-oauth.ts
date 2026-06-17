import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { resolveAuthPath, type CoreResponse, type RunOptions, type StreamEvent } from "@yadimon/codex-to-llm";
import type {
  ConversationMessageInput,
  MessageRole,
  MessageTextBlock,
  ResponsesInput,
  ResponsesRequestBody,
  Runner,
  ServerOptions
} from "../types.js";

export const DEFAULT_CODEX_OAUTH_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const DEFAULT_CODEX_CLIENT_VERSION = "0.140.0";
const DEFAULT_CODEX_USER_AGENT = "codex-cli/0.140.0";

type FetchLike = typeof fetch;
type DirectRunOptions = RunOptions & { responsesBody?: ResponsesRequestBody };

export function createCodexOauthRunner(options: ServerOptions & {
  endpoint?: string;
  fetchImpl?: FetchLike;
} = {}): Runner {
  const endpoint =
    options.endpoint ||
    options.codexOauthEndpoint ||
    process.env.CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT ||
    DEFAULT_CODEX_OAUTH_ENDPOINT;
  const fetchImpl = options.fetchImpl || fetch;

  return {
    directResponses: true,
    async runPrompt(prompt, requestOptions = {}) {
      let completedResponse: CoreResponse | undefined;
      for await (const event of streamCodexOauthResponse({
        prompt,
        requestOptions: requestOptions as DirectRunOptions,
        baseOptions: options,
        endpoint,
        fetchImpl
      })) {
        if (event.type === "response.completed") {
          completedResponse = event.response;
        }
      }
      if (!completedResponse) {
        throw new Error("Codex direct mode completed without a response payload");
      }
      return completedResponse;
    },
    streamPrompt(prompt, requestOptions = {}) {
      return streamCodexOauthResponse({
        prompt,
        requestOptions: requestOptions as DirectRunOptions,
        baseOptions: options,
        endpoint,
        fetchImpl
      });
    }
  };
}

async function* streamCodexOauthResponse({
  prompt,
  requestOptions,
  baseOptions,
  endpoint,
  fetchImpl
}: {
  prompt: string;
  requestOptions: DirectRunOptions;
  baseOptions: ServerOptions;
  endpoint: string;
  fetchImpl: FetchLike;
}): AsyncIterable<StreamEvent> {
  const body = requestOptions.responsesBody;
  if (!body) {
    throw new Error("Codex direct mode requires the original Responses request body");
  }

  const auth = loadCodexAuth(baseOptions.authPath);
  const requestBody = buildCodexResponsesBody(body, requestOptions);
  const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
  const model = String(requestBody.model || requestOptions.model || body.model || "");
  const startedAt = Math.floor(Date.now() / 1000);
  const rawEvents: unknown[] = [];
  let content = "";
  let completedResponse: CoreResponse | undefined;

  yield {
    type: "response.started",
    response: {
      id: responseId,
      model,
      prompt,
      createdAt: startedAt
    }
  };

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: buildCodexHeaders(auth),
    body: JSON.stringify(requestBody),
    signal: requestOptions.signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Codex direct upstream failed with HTTP ${response.status}: ${trimErrorBody(text)}`);
  }

  for await (const event of readSseJsonEvents(response)) {
    rawEvents.push(event);
    yield { type: "response.raw_event", event };

    if (event.type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (delta) {
        content += delta;
        yield { type: "response.output_text.delta", delta };
      }
      continue;
    }

    if (event.type === "response.failed") {
      throw new Error(readUpstreamFailureMessage(event));
    }

    if (event.type === "response.completed") {
      const upstreamResponse = readRecord(event.response);
      const completedContent = extractOutputText(upstreamResponse) || content;
      completedResponse = {
        id: readString(upstreamResponse.id) || responseId,
        model: readString(upstreamResponse.model) || model,
        prompt,
        createdAt: readNumber(upstreamResponse.created_at) || startedAt,
        content: completedContent,
        usage: normalizeUsage(upstreamResponse.usage),
        raw: {
          stderr: "",
          events: rawEvents
        }
      };
      yield { type: "response.completed", response: completedResponse };
    }
  }

  if (!completedResponse) {
    throw new Error("Codex direct upstream stream ended without response.completed");
  }
}

function loadCodexAuth(authPathOption?: string): { accessToken: string; accountId?: string } {
  const authPath = resolveAuthPath(authPathOption);
  if (!fs.existsSync(authPath)) {
    throw new Error(`Codex auth not found at ${authPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(authPath, "utf8")) as Record<string, unknown>;
  const tokens = readRecord(parsed.tokens);
  const accessToken = readString(tokens.access_token) || readString(parsed.access_token);
  if (!accessToken) {
    throw new Error(`Codex auth at ${authPath} does not contain an access token`);
  }
  return {
    accessToken,
    accountId: readString(tokens.account_id) || readString(parsed.account_id)
  };
}

function buildCodexHeaders(auth: { accessToken: string; accountId?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
    "Authorization": `Bearer ${auth.accessToken}`,
    "originator": "codex_cli_rs",
    "Version": process.env.CODEX_TO_LLM_CODEX_CLIENT_VERSION || DEFAULT_CODEX_CLIENT_VERSION,
    "User-Agent": process.env.CODEX_TO_LLM_CODEX_USER_AGENT || DEFAULT_CODEX_USER_AGENT
  };
  if (auth.accountId) {
    headers["chatgpt-account-id"] = auth.accountId;
  }
  return headers;
}

function buildCodexResponsesBody(
  body: ResponsesRequestBody,
  requestOptions: DirectRunOptions
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: body.model || requestOptions.model,
    input: toCodexInput(body.input),
    stream: true,
    store: false
  };

  if (body.instructions != null) {
    requestBody.instructions = body.instructions;
  }
  if (requestOptions.reasoningEffort) {
    requestBody.reasoning = { effort: requestOptions.reasoningEffort };
  }

  return requestBody;
}

function toCodexInput(input: ResponsesInput | undefined): unknown[] {
  if (typeof input === "string") {
    return [toCodexMessage({ role: "user", content: input }, 0)];
  }
  if (Array.isArray(input)) {
    return input.map((message, index) => toCodexMessage(message, index));
  }
  if (input && typeof input === "object") {
    const messages = input.messages ?? input.input;
    if (typeof messages === "string") {
      return [toCodexMessage({ role: "user", content: messages }, 0)];
    }
    if (Array.isArray(messages)) {
      return messages.map((message, index) => toCodexMessage(message, index));
    }
  }
  throw new Error("Codex direct mode requires string input or message input");
}

function toCodexMessage(message: ConversationMessageInput, index: number): Record<string, unknown> {
  const role = message.role || "user";
  return {
    type: "message",
    role: normalizeRole(role, index),
    content: textBlocksToCodexContent(message.content, index)
  };
}

function normalizeRole(role: MessageRole, index: number): MessageRole {
  if (role === "system" || role === "developer" || role === "user" || role === "assistant") {
    return role;
  }
  throw new Error(`Unsupported message role at index ${index}: ${String(role)}`);
}

function textBlocksToCodexContent(
  content: string | MessageTextBlock[],
  index: number
): Array<Record<string, string>> {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }
  if (!Array.isArray(content)) {
    throw new Error(`Message at index ${index} must contain text content`);
  }
  return content.map(block => ({
    type: block.type === "output_text" ? "output_text" : "input_text",
    text: block.text
  }));
}

async function* readSseJsonEvents(response: Response): AsyncIterable<Record<string, unknown>> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = parseSsePart(part);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  const event = parseSsePart(buffer);
  if (event) {
    yield event;
  }
}

function parseSsePart(part: string): Record<string, unknown> | null {
  const data = part
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") {
    return null;
  }
  const parsed = JSON.parse(data) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

function extractOutputText(response: Record<string, unknown>): string {
  const direct = readString(response.output_text);
  if (direct) {
    return direct;
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const record = readRecord(item);
    const content = Array.isArray(record.content) ? record.content : [];
    for (const block of content) {
      const blockRecord = readRecord(block);
      const text = readString(blockRecord.text);
      if (text) {
        parts.push(text);
      }
    }
  }
  return parts.join("");
}

function normalizeUsage(value: unknown) {
  const usage = readRecord(value);
  const inputTokens = readNumber(usage.input_tokens);
  const cachedInputTokens = readNumber(usage.cached_input_tokens);
  const outputTokens = readNumber(usage.output_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: readNumber(usage.total_tokens) || inputTokens + outputTokens
  };
}

function readUpstreamFailureMessage(event: Record<string, unknown>): string {
  const response = readRecord(event.response);
  const error = readRecord(response.error);
  return readString(error.message) || "Codex direct upstream response failed";
}

function trimErrorBody(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 500) || "empty response body";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
