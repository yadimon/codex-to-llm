import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MODEL,
  runPrompt as defaultRunPrompt,
  streamPrompt as defaultStreamPrompt
} from "@yadimon/codex-to-llm";
import type {
  CoreResponse,
  RunOptions,
  StreamEvent,
  WebSearchMode
} from "@yadimon/codex-to-llm";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const UNSUPPORTED_REQUEST_FIELDS = [
  "tools",
  "tool_choice",
  "conversation",
  "previous_response_id",
  "input_audio",
  "input_image",
  "parallel_tool_calls"
] as const;

export interface ResponsesRequestBody {
  model?: string;
  stream?: boolean;
  input?: ResponsesInput;
  instructions?: string;
  max_output_tokens?: number;
  reasoning?: {
    effort?: string;
  };
  tools?: unknown;
  tool_choice?: unknown;
  conversation?: unknown;
  previous_response_id?: unknown;
  input_audio?: unknown;
  input_image?: unknown;
  parallel_tool_calls?: unknown;
}

export interface Runner {
  runPrompt(prompt: string, options?: RunOptions): Promise<CoreResponse>;
  streamPrompt(prompt: string, options?: RunOptions): AsyncIterable<StreamEvent>;
}

export interface ServerOptions extends RunOptions {
  host?: string;
  port?: number;
  models?: string[] | string;
  defaultModel?: string;
  apiKey?: string;
  mockMode?: string | boolean;
  runner?: Runner;
}

type HttpError = Error & { statusCode: number };
type ServerPromptInput = {
  instructions?: string;
  input?: ResponsesInput;
};
type MessageRole = "system" | "developer" | "user" | "assistant";
type MessageTextBlock = {
  type: "text" | "input_text" | "output_text";
  text: string;
};
type ConversationMessageInput = {
  role?: MessageRole;
  content: string | MessageTextBlock[];
};
type ResponsesInput =
  | string
  | ConversationMessageInput[]
  | {
      input?: string | ConversationMessageInput[];
      messages?: ConversationMessageInput[];
    };
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high"]);
const SUPPORTED_ROLES = new Set<MessageRole>(["system", "developer", "user", "assistant"]);
const TEXT_BLOCK_TYPES = new Set<MessageTextBlock["type"]>(["text", "input_text", "output_text"]);

export function createServer(options: ServerOptions = {}) {
  const host = options.host || process.env.CODEX_TO_LLM_SERVER_HOST || DEFAULT_HOST;
  const port = normalizeServerPort(options.port ?? process.env.CODEX_TO_LLM_SERVER_PORT ?? DEFAULT_PORT);
  const runner = options.runner || createDefaultRunner(options);
  const models = resolveModels(options);
  const apiKey = options.apiKey || process.env.CODEX_TO_LLM_SERVER_API_KEY;

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/models") {
        sendJson(response, 200, buildModelsResponse(models));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/responses") {
        assertAuthorized(request, apiKey);
        const body = await readJsonBody(request);
        validateResponsesRequest(body);
        validateRequestedModel(body.model, models);
        const prompt = requestToPrompt(body);
        const runOptions = requestToRunOptions(body, options);

        if (body.stream) {
          await streamOpenAIResponse(response, runner, prompt, runOptions);
          return;
        }

        const result = await runner.runPrompt(prompt, runOptions);
        sendJson(response, 200, buildOpenAIResponse(result));
        return;
      }

      sendJson(response, 404, createErrorBody("not_found", "Route not found"));
    } catch (error) {
      const statusCode = isHttpError(error) ? error.statusCode : 500;
      const message = error instanceof Error ? error.message : String(error);
      sendJson(
        response,
        statusCode,
        createErrorBody(statusCode >= 500 ? "server_error" : "invalid_request_error", message)
      );
    }
  });

  return {
    host,
    port,
    server
  };
}

export async function startServer(options: ServerOptions = {}) {
  const { server, host, port } = createServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${resolvedPort}`;

  return {
    host,
    port: resolvedPort,
    url,
    server,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

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

function createDefaultRunner(options: ServerOptions): Runner {
  const mockMode = options.mockMode || process.env.CODEX_TO_LLM_SERVER_MOCK_MODE;
  if (mockMode && mockMode !== "off") {
    return createMockRunner(options);
  }

  return {
    runPrompt(prompt, requestOptions = {}) {
      return defaultRunPrompt(prompt, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    },
    streamPrompt(prompt, requestOptions = {}) {
      return defaultStreamPrompt(prompt, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    }
  };
}

function createMockRunner(options: ServerOptions): Runner {
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
      item: {
        text: content
      }
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

function defaultRunnerOptions(options: ServerOptions): RunOptions {
  return {
    authPath: options.authPath || process.env.CODEX_TO_LLM_AUTH_PATH,
    cliPath: options.cliPath || process.env.CODEX_TO_LLM_CLI_PATH,
    configHome: options.configHome || process.env.CODEX_TO_LLM_CONFIG_HOME,
    cwd: options.cwd || process.env.CODEX_TO_LLM_WORKSPACE,
    reasoningEffort: options.reasoningEffort || process.env.CODEX_TO_LLM_REASONING_EFFORT,
    sandbox: options.sandbox || process.env.CODEX_TO_LLM_SANDBOX,
    webSearch: options.webSearch ?? readWebSearchEnv("CODEX_TO_LLM_WEB_SEARCH"),
    ignoreRules: options.ignoreRules ?? readBooleanEnv("CODEX_TO_LLM_IGNORE_RULES"),
    ignoreUserConfig:
      options.ignoreUserConfig ?? readBooleanEnv("CODEX_TO_LLM_IGNORE_USER_CONFIG")
  };
}

function readWebSearchEnv(name: string): WebSearchMode | undefined {
  const value = process.env[name];
  if (value == null || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "disabled" || normalized === "cached" || normalized === "live") {
    return normalized;
  }

  throw new Error(`Invalid ${name}: expected disabled, cached, or live`);
}

function readBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name];
  if (value == null || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${name}: expected a boolean value`);
}

function resolveModels(options: ServerOptions): string[] {
  const configured = options.models || process.env.CODEX_TO_LLM_SERVER_MODELS;
  if (Array.isArray(configured)) {
    return configured;
  }

  if (typeof configured === "string" && configured.trim()) {
    return configured.split(",").map(value => value.trim()).filter(Boolean);
  }

  return [options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL];
}

function assertAuthorized(request: IncomingMessage, apiKey?: string): void {
  if (!apiKey) {
    return;
  }

  const authorization = request.headers.authorization || "";
  if (matchesBearerToken(authorization, apiKey)) {
    return;
  }

  throw createHttpError(401, "Missing or invalid bearer token");
}

function matchesBearerToken(authorization: string, apiKey: string): boolean {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const actual = Buffer.from(authorization);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateResponsesRequest(body: ResponsesRequestBody): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }

  if (body.input == null) {
    throw createHttpError(400, "input is required");
  }

  for (const field of UNSUPPORTED_REQUEST_FIELDS) {
    if (body[field] != null) {
      throw createHttpError(400, `${field} is not supported`);
    }
  }
}

function validateRequestedModel(model: string | undefined, models: string[]): void {
  if (!model) {
    return;
  }

  if (!models.includes(model)) {
    throw createHttpError(400, `Unsupported model: ${model}`);
  }
}

function requestToPrompt(body: ResponsesRequestBody): string {
  return serializeServerPrompt({
    instructions: body.instructions,
    input: body.input
  });
}

function requestToRunOptions(body: ResponsesRequestBody, options: ServerOptions): RunOptions {
  validateReasoningEffort(body.reasoning?.effort);
  validateMaxOutputTokens(body.max_output_tokens);

  return {
    model: body.model || options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL,
    maxTokens: body.max_output_tokens ?? undefined,
    reasoningEffort: body.reasoning?.effort ?? undefined
  };
}

function validateReasoningEffort(effort: string | undefined): void {
  if (effort == null) {
    return;
  }

  if (!VALID_REASONING_EFFORTS.has(effort)) {
    throw createHttpError(400, "Invalid reasoning.effort");
  }
}

function validateMaxOutputTokens(maxOutputTokens: number | undefined): void {
  if (maxOutputTokens == null) {
    return;
  }

  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw createHttpError(400, "Invalid max_output_tokens");
  }
}

async function streamOpenAIResponse(
  response: ServerResponse,
  runner: Runner,
  prompt: string,
  runOptions: RunOptions
) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");

  let finalResponse;
  let hasError = false;

  try {
    for await (const event of runner.streamPrompt(prompt, runOptions)) {
      if (event.type === "response.started" && event.response) {
        writeSse(response, "response.created", {
          id: event.response.id,
          model: event.response.model,
          object: "response",
          status: "in_progress"
        });
        continue;
      }

      if (event.type === "response.output_text.delta") {
        writeSse(response, "response.output_text.delta", {
          delta: event.delta
        });
        continue;
      }

      if (event.type === "response.completed" && event.response) {
        finalResponse = buildOpenAIResponse(event.response);
        writeSse(response, "response.output_text.done", {
          text: event.response.content
        });
        writeSse(response, "response.completed", finalResponse);
      }
    }
  } catch (error) {
    hasError = true;
    writeSse(
      response,
      "response.failed",
      createErrorBody("server_error", error instanceof Error ? error.message : String(error))
    );
  }

  if (!hasError && !finalResponse) {
    hasError = true;
    writeSse(
      response,
      "response.failed",
      createErrorBody("server_error", "Runner stream ended without a completed response")
    );
  }

  if (!hasError) {
    response.write("data: [DONE]\n\n");
  }
  response.end();

  return finalResponse;
}

async function readJsonBody(request: IncomingMessage): Promise<ResponsesRequestBody> {
  const chunks: Buffer[] = [];
  const maxBodySize = 10 * 1024 * 1024;
  let totalSize = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > maxBodySize) {
      throw createHttpError(413, "Request body too large");
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as ResponsesRequestBody;
  } catch {
    throw createHttpError(400, "Request body must be valid JSON");
  }
}

function buildModelsResponse(models: string[]) {
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

function normalizeServerPort(value: number | string): number {
  const numericPort =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
    throw new Error("Invalid server port: expected an integer between 0 and 65535");
  }

  return numericPort;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function writeSse(response: ServerResponse, eventName: string, data: unknown): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createErrorBody(type: string, message: string) {
  return {
    error: {
      type,
      message
    }
  };
}

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && "statusCode" in error && typeof (error as HttpError).statusCode === "number";
}

function serializeServerPrompt(input: ServerPromptInput): string {
  const normalized = normalizeServerPromptInput(input);
  const sections = [
    "You are being called through a stateless LLM adapter.",
    "Use the conversation exactly as provided and answer as the assistant."
  ];

  if (normalized.instructions) {
    sections.push(`## Instructions\n${normalized.instructions}`);
  }

  const conversation = normalized.messages
    .map(message => `### ${message.role}\n${message.content}`)
    .join("\n\n");
  sections.push(`## Conversation\n${conversation}`);
  sections.push("## Assistant Response\nRespond to the latest conversation turn.");

  return sections.join("\n\n");
}

function normalizeServerPromptInput(input: ServerPromptInput): {
  instructions?: string;
  messages: Array<{ role: MessageRole; content: string }>;
} {
  const instructions =
    input.instructions == null ? undefined : normalizeText(input.instructions, "instructions");
  const messages: Array<{ role: MessageRole; content: string }> = [];
  const source = input.input;

  if (typeof source === "string") {
    messages.push({
      role: "user",
      content: normalizeText(source, "input")
    });
  } else if (Array.isArray(source)) {
    messages.push(...normalizeMessageEntries(source, "user"));
  } else if (source && typeof source === "object") {
    if (source.messages != null) {
      if (!Array.isArray(source.messages)) {
        throw createHttpError(400, "input.messages must be an array");
      }
      messages.push(...normalizeMessageEntries(source.messages));
    }

    if (source.input != null) {
      messages.push(
        ...normalizeMessageEntries(
          typeof source.input === "string" || Array.isArray(source.input)
            ? source.input
            : JSON.stringify(source.input),
          "user"
        )
      );
    }
  } else {
    messages.push({
      role: "user",
      content: normalizeText(JSON.stringify(source ?? ""), "input")
    });
  }

  if (messages.length === 0) {
    throw createHttpError(400, "input is required");
  }

  return { instructions, messages };
}

function normalizeMessageEntries(
  entries: string | ConversationMessageInput[],
  defaultRole?: MessageRole
): Array<{ role: MessageRole; content: string }> {
  if (typeof entries === "string") {
    return [
      {
        role: defaultRole || "user",
        content: normalizeText(entries, "message")
      }
    ];
  }

  return entries.map((entry, index) => normalizeMessage(entry, defaultRole, index));
}

function normalizeMessage(
  entry: ConversationMessageInput,
  defaultRole: MessageRole | undefined,
  index: number
): { role: MessageRole; content: string } {
  if (!entry || typeof entry !== "object") {
    throw createHttpError(400, `Message at index ${index} must be an object`);
  }

  const role = entry.role || defaultRole;
  if (!role || !SUPPORTED_ROLES.has(role)) {
    throw createHttpError(400, `Unsupported message role: ${role}`);
  }

  return {
    role,
    content: normalizeMessageContent(entry.content, `content for message ${index}`)
  };
}

function normalizeMessageContent(content: string | MessageTextBlock[], label: string): string {
  if (typeof content === "string") {
    return normalizeText(content, label);
  }

  if (!Array.isArray(content)) {
    throw createHttpError(400, `${label} must be a string or text block array`);
  }

  const blocks = content.map((block, index) => {
    if (!block || typeof block !== "object") {
      throw createHttpError(400, `${label} block ${index} must be an object`);
    }

    if (!TEXT_BLOCK_TYPES.has(block.type) || typeof block.text !== "string") {
      throw createHttpError(400, `${label} block ${index} must be a supported text block`);
    }

    return normalizeText(block.text, `${label} block ${index}`);
  });

  return blocks.join("\n\n");
}

function normalizeText(value: string, label: string): string {
  if (typeof value !== "string") {
    throw createHttpError(400, `${label} must be a string`);
  }

  if (!value.trim()) {
    throw createHttpError(400, `${label} must not be empty`);
  }

  return value;
}
