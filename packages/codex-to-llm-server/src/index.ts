import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_MODEL,
  runResponse as defaultRunResponse,
  streamResponse as defaultStreamResponse
} from "@yadimon/codex-to-llm";
import type {
  ConversationMessageInput,
  CoreResponse,
  ConversationInput,
  RunOptions,
  StreamEvent
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
  input?: ConversationInput;
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
  runResponse(input: ConversationInput, options?: RunOptions): Promise<CoreResponse>;
  streamResponse(input: ConversationInput, options?: RunOptions): AsyncIterable<StreamEvent>;
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
type ServerCoreInput = {
  instructions?: string;
  input?: string | ConversationMessageInput[];
};

export function createServer(options: ServerOptions = {}) {
  const host = options.host || process.env.CODEX_TO_LLM_SERVER_HOST || DEFAULT_HOST;
  const port = options.port ?? Number(process.env.CODEX_TO_LLM_SERVER_PORT || DEFAULT_PORT);
  const runner = options.runner || createDefaultRunner(options);
  const models = resolveModels(options);
  const apiKey = options.apiKey || process.env.COMPAT_API_KEY || process.env.CODEX_TO_LLM_SERVER_API_KEY;

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
        const coreInput = requestToCoreInput(body);
        const runOptions = requestToRunOptions(body, options);

        if (body.stream) {
          await streamOpenAIResponse(response, runner, coreInput, runOptions);
          return;
        }

        const result = await runner.runResponse(coreInput, runOptions);
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
    runResponse(input, requestOptions = {}) {
      return defaultRunResponse(input, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    },
    streamResponse(input, requestOptions = {}) {
      return defaultStreamResponse(input, {
        ...defaultRunnerOptions(options),
        ...requestOptions
      });
    }
  };
}

function createMockRunner(options: ServerOptions): Runner {
  return {
    async runResponse(input, requestOptions = {}) {
      return buildMockCoreResponse(input, requestOptions, options);
    },
    async *streamResponse(input, requestOptions = {}) {
      const response = buildMockCoreResponse(input, requestOptions, options);
      yield {
        type: "response.started",
        response: {
          id: response.id,
          model: response.model,
          instructions: response.instructions,
          messages: response.messages,
          createdAt: response.createdAt
        }
      };
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
  input: ConversationInput,
  requestOptions: RunOptions,
  options: ServerOptions
): CoreResponse {
  const model =
    requestOptions.model ||
    options.defaultModel ||
    process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL ||
    DEFAULT_MODEL;
  const content = process.env.CODEX_TO_LLM_SERVER_MOCK_RESPONSE || "mock response";
  const normalizedInput = isObjectWithInput(input)
    ? typeof input.input === "string"
      ? input.input
      : JSON.stringify(input.input ?? "", null, 2)
    : "";

  return {
    id: `resp_mock_${randomUUID().replace(/-/g, "")}`,
    model,
    instructions: typeof input === "object" && input && !Array.isArray(input) ? input.instructions : undefined,
    messages: [
      {
        role: "user",
        content: normalizedInput
      }
    ],
    createdAt: Math.floor(Date.now() / 1000),
    content,
    usage: {
      inputTokens: Math.ceil(normalizedInput.length / 4),
      cachedInputTokens: 0,
      outputTokens: Math.ceil(content.length / 4),
      totalTokens: Math.ceil(normalizedInput.length / 4) + Math.ceil(content.length / 4)
    },
    raw: {
      stderr: "",
      events: []
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
    sandbox: options.sandbox || process.env.CODEX_TO_LLM_SANDBOX
  };
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
  if (authorization === `Bearer ${apiKey}`) {
    return;
  }

  throw createHttpError(401, "Missing or invalid bearer token");
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

function requestToCoreInput(body: ResponsesRequestBody): ServerCoreInput {
  return {
    instructions: body.instructions,
    input:
      typeof body.input === "string" || Array.isArray(body.input) ? body.input : JSON.stringify(body.input ?? "")
  };
}

function requestToRunOptions(body: ResponsesRequestBody, options: ServerOptions): RunOptions {
  return {
    model: body.model || options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL,
    maxTokens: body.max_output_tokens ?? undefined,
    reasoningEffort: body.reasoning?.effort ?? undefined
  };
}

async function streamOpenAIResponse(
  response: ServerResponse,
  runner: Runner,
  coreInput: ServerCoreInput,
  runOptions: RunOptions
) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");

  let finalResponse;
  let hasError = false;

  try {
    for await (const event of runner.streamResponse(coreInput, runOptions)) {
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

function isObjectWithInput(
  input: ConversationInput
): input is Extract<ConversationInput, { input?: ConversationInput }> {
  return typeof input === "object" && input !== null && !Array.isArray(input) && "input" in input;
}
