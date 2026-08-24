import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { resolveAuthPath } from "./workspace.js";
import { createResponsesImageContent } from "./images.js";
import {
  DEFAULT_MODEL,
  type CoreResponse,
  type ResponseShell,
  type RunOptions,
  type StreamEvent
} from "./types.js";

export const DEFAULT_DIRECT_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
export const DIRECT_API_RISK_ENV = "CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK";

const DEFAULT_CODEX_CLIENT_VERSION = "0.144.1";
const DEFAULT_CODEX_USER_AGENT = "codex-cli/0.144.1";

type FetchLike = typeof fetch;

export async function runPromptDirectApi(
  prompt: string,
  options: RunOptions = {}
): Promise<CoreResponse> {
  let completedResponse: CoreResponse | undefined;
  for await (const event of streamPromptDirectApi(prompt, options)) {
    if (event.type === "response.completed") {
      completedResponse = event.response;
    }
  }
  if (!completedResponse) {
    throw new Error("Direct API call completed without a response payload");
  }
  return completedResponse;
}

export async function* streamPromptDirectApi(
  prompt: string,
  options: RunOptions = {},
  fetchImpl: FetchLike = fetch
): AsyncIterable<StreamEvent> {
  validateDirectApiPrompt(prompt, options);
  assertDirectApiRiskConfirmed(options);
  assertDirectApiInstructions(options);

  const endpoint =
    options.directApiEndpoint ||
    process.env.CODEX_TO_LLM_DIRECT_API_ENDPOINT ||
    DEFAULT_DIRECT_API_ENDPOINT;
  const auth = loadDirectApiAuth(options.authPath);
  const model = options.model || DEFAULT_MODEL;
  const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
  const startedAt = Math.floor(Date.now() / 1000);
  const rawEvents: unknown[] = [];
  let content = "";
  let completedResponse: CoreResponse | undefined;

  yield {
    type: "response.started",
    response: createResponseShell({ responseId, model, prompt, startedAt })
  };

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: buildDirectApiHeaders(auth),
    body: JSON.stringify(buildDirectApiBody(prompt, options)),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Direct API upstream failed with HTTP ${response.status}: ${trimErrorBody(text)}`);
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
      completedResponse = {
        id: readString(upstreamResponse.id) || responseId,
        model: readString(upstreamResponse.model) || model,
        prompt,
        createdAt: readNumber(upstreamResponse.created_at) || startedAt,
        content: extractOutputText(upstreamResponse) || content,
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
    throw new Error("Direct API upstream stream ended without response.completed");
  }
}

export function assertDirectApiRiskConfirmed(options: RunOptions = {}): void {
  if (options.confirmDirectApiRisk || process.env[DIRECT_API_RISK_ENV] === "1") {
    return;
  }
  throw new Error(
    `Direct API call mode requires --confirm-direct-api-risk or ${DIRECT_API_RISK_ENV}=1`
  );
}

export function assertDirectApiInstructions(options: RunOptions = {}): void {
  if (options.directApiInstructions?.trim()) {
    return;
  }
  throw new Error("Direct API call mode requires --instructions with user-supplied instructions");
}

function validateDirectApiPrompt(prompt: string, options: RunOptions): void {
  if (typeof prompt !== "string") {
    throw new Error("Prompt must be a string");
  }
  if (!prompt.trim() && (!Array.isArray(options.images) || options.images.length === 0)) {
    throw new Error("Prompt must not be empty");
  }
}

function loadDirectApiAuth(authPathOption?: string): { accessToken: string; accountId?: string } {
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

function buildDirectApiHeaders(auth: {
  accessToken: string;
  accountId?: string;
}): Record<string, string> {
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

function buildDirectApiBody(prompt: string, options: RunOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_MODEL,
    instructions: options.directApiInstructions,
    input: [
      {
        type: "message",
        role: "user",
        content: createResponsesImageContent(prompt, options.images, {
          baseDir: options.cwd || process.cwd()
        })
      }
    ],
    stream: true,
    store: false
  };

  if (options.reasoningEffort) {
    body.reasoning = { effort: options.reasoningEffort };
  }

  return body;
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
  return readString(error.message) || "Direct API upstream response failed";
}

function trimErrorBody(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 500) || "empty response body";
}

function createResponseShell({
  responseId,
  model,
  prompt,
  startedAt
}: {
  responseId: string;
  model: string;
  prompt: string;
  startedAt: number;
}): ResponseShell {
  return {
    id: responseId,
    model,
    prompt,
    createdAt: startedAt
  };
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
