import { createServer as createHttpServer } from "node:http";
import { assertAuthorized } from "./auth.js";
import {
  assertCodexOauthRiskAccepted,
  normalizeServerPort,
  resolveBackend,
  resolveModels
} from "./config.js";
import {
  createErrorBody,
  createHttpError,
  isHttpError,
  readJsonBody,
  sendJson
} from "./http-io.js";
import { logEvent, newRequestId } from "./log.js";
import {
  buildModelsResponse,
  buildOpenAIResponse,
  streamOpenAIResponse
} from "./openai-format.js";
import { requestToImageInputs, requestToPrompt } from "./prompt.js";
import { createDefaultRunner } from "./runners/default.js";
import { createCodexOauthRunner } from "./runners/codex-oauth.js";
import { createMockRunner } from "./runners/mock.js";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  type ServerOptions
} from "./types.js";
import {
  requestToRunOptions,
  validateRequestedModel,
  validateResponsesRequest
} from "./validation.js";

export {
  buildModelsResponse,
  buildOpenAIResponse,
  streamOpenAIResponse
} from "./openai-format.js";
export { logEvent, newRequestId } from "./log.js";
export type { LogLevel, LogRecord } from "./log.js";
export {
  serializeServerPrompt,
  normalizeServerPromptInput,
  requestToImageInputs
} from "./prompt.js";
export {
  createErrorBody,
  createHttpError,
  isHttpError,
  readJsonBody,
  sendJson,
  writeSse
} from "./http-io.js";
export { assertAuthorized } from "./auth.js";
export {
  assertCodexOauthRiskAccepted,
  CODEX_OAUTH_RISK_ENV,
  defaultRunnerOptions,
  normalizeServerPort,
  resolveBackend,
  resolveModels
} from "./config.js";
export { createDefaultRunner } from "./runners/default.js";
export { createCodexOauthRunner } from "./runners/codex-oauth.js";
export { createMockRunner } from "./runners/mock.js";
export {
  validateRequestedModel,
  validateResponsesRequest
} from "./validation.js";
export type {
  ConversationMessageInput,
  HttpError,
  MessageRole,
  MessageImageBlock,
  MessageTextBlock,
  ResponsesInput,
  ResponsesRequestBody,
  Runner,
  ServerOptions,
  ServerPromptInput
} from "./types.js";

export function createServer(options: ServerOptions = {}) {
  const host = options.host || process.env.CODEX_TO_LLM_SERVER_HOST || DEFAULT_HOST;
  const port = normalizeServerPort(options.port ?? process.env.CODEX_TO_LLM_SERVER_PORT ?? DEFAULT_PORT);
  const apiKey = options.apiKey || process.env.CODEX_TO_LLM_SERVER_API_KEY;
  const backend = resolveBackend(options);
  const runner = options.runner || createConfiguredRunner(options, backend, host, apiKey);
  const { models, defaultModel } = resolveModels(options);

  const server = createHttpServer(async (request, response) => {
    const reqId = newRequestId();
    const start = Date.now();
    const route = `${request.method} ${new URL(request.url || "/", "http://x").pathname}`;
    const runMeta: Record<string, unknown> = {};
    let errorMessage: string | undefined;
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { ok: true });
      } else if (request.method === "GET" && url.pathname === "/v1/models") {
        sendJson(response, 200, buildModelsResponse(models));
      } else if (request.method === "POST" && url.pathname === "/v1/responses") {
        assertAuthorized(request, apiKey);
        const body = await readJsonBody(request);
        validateResponsesRequest(body);
        validateRequestedModel(body.model, models);
        if (runner.directResponses && !body.instructions?.trim()) {
          throw createHttpError(400, "instructions are required in codex-oauth direct mode");
        }
        runner.validateDirectInput?.(body);
        const prompt = runner.directResponses
          ? JSON.stringify({ instructions: body.instructions, input: body.input })
          : requestToPrompt(body);
        const runOptions = requestToRunOptions(body, options, defaultModel);
        if (!runner.directResponses) {
          runOptions.images = requestToImageInputs(body.input);
        }
        const runnerOptions = {
          ...runOptions,
          responsesBody: body
        } as typeof runOptions;
        runMeta.model = runOptions.model;
        runMeta.stream = !!body.stream;
        runMeta.prompt_chars = prompt.length;
        runMeta.image_count = runOptions.images?.length || 0;

        if (body.stream) {
          const final = await streamOpenAIResponse(request, response, runner, prompt, runnerOptions);
          if (final?.usage) {
            runMeta.input_tokens = final.usage.input_tokens;
            runMeta.output_tokens = final.usage.output_tokens;
          }
        } else {
          const result = await runner.runPrompt(prompt, runnerOptions);
          runMeta.input_tokens = result.usage.inputTokens;
          runMeta.output_tokens = result.usage.outputTokens;
          sendJson(response, 200, buildOpenAIResponse(result));
        }
      } else {
        sendJson(response, 404, createErrorBody("not_found", "Route not found"));
      }
    } catch (error) {
      const statusCode = isHttpError(error) ? error.statusCode : 500;
      const message = error instanceof Error ? error.message : String(error);
      errorMessage = message;
      sendJson(
        response,
        statusCode,
        createErrorBody(statusCode >= 500 ? "server_error" : "invalid_request_error", message)
      );
    } finally {
      const status = response.statusCode;
      const isFailure = status >= 400;
      logEvent({
        level: isFailure ? (status >= 500 ? "error" : "warn") : "info",
        msg: isFailure ? "request_failed" : "request",
        req_id: reqId,
        route,
        status,
        latency_ms: Date.now() - start,
        ...(errorMessage ? { error: errorMessage } : {}),
        ...runMeta
      });
    }
  });

  return { host, port, server };
}

export async function startServer(options: ServerOptions = {}) {
  const { server, host, port } = createServer(options);
  const backend = resolveBackend(options);

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
    backend,
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

function resolveMockMode(options: ServerOptions): boolean {
  const mockMode = options.mockMode || process.env.CODEX_TO_LLM_SERVER_MOCK_MODE;
  return Boolean(mockMode) && mockMode !== "off";
}

function createConfiguredRunner(
  options: ServerOptions,
  backend: "codex-exec" | "codex-oauth",
  host: string,
  apiKey: string | undefined
) {
  if (resolveMockMode(options)) {
    return createMockRunner(options);
  }
  if (backend === "codex-oauth") {
    assertCodexOauthRiskAccepted();
    assertDirectModeBindIsProtected(host, apiKey);
    return createCodexOauthRunner(options);
  }
  return createDefaultRunner(options);
}

function assertDirectModeBindIsProtected(host: string, apiKey: string | undefined): void {
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return;
  }
  if (apiKey) {
    return;
  }
  throw new Error("codex-oauth on non-local hosts requires CODEX_TO_LLM_SERVER_API_KEY");
}
