import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL, runResponse as defaultRunResponse, streamResponse as defaultStreamResponse } from "@yadimon/codex-to-llm";
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
];
const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high"]);
export function createServer(options = {}) {
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
        }
        catch (error) {
            const statusCode = isHttpError(error) ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : String(error);
            sendJson(response, statusCode, createErrorBody(statusCode >= 500 ? "server_error" : "invalid_request_error", message));
        }
    });
    return {
        host,
        port,
        server
    };
}
export async function startServer(options = {}) {
    const { server, host, port } = createServer(options);
    await new Promise((resolve, reject) => {
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
            return new Promise((resolve, reject) => {
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
export function buildOpenAIResponse(result) {
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
function createDefaultRunner(options) {
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
function createMockRunner(options) {
    return {
        async runResponse(input, requestOptions = {}) {
            return buildMockCoreResponse(input, requestOptions, options);
        },
        async *streamResponse(input, requestOptions = {}) {
            const response = buildMockCoreResponse(input, requestOptions, options);
            for (const event of response.raw.events) {
                yield {
                    type: "response.raw_event",
                    event
                };
            }
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
function buildMockCoreResponse(input, requestOptions, options) {
    const model = requestOptions.model ||
        options.defaultModel ||
        process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL ||
        DEFAULT_MODEL;
    const content = process.env.CODEX_TO_LLM_SERVER_MOCK_RESPONSE || "mock response";
    const normalizedInput = isObjectWithInput(input)
        ? typeof input.input === "string"
            ? input.input
            : JSON.stringify(input.input ?? "", null, 2)
        : "";
    const inputTokens = Math.ceil(normalizedInput.length / 4);
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
function defaultRunnerOptions(options) {
    return {
        authPath: options.authPath || process.env.CODEX_TO_LLM_AUTH_PATH,
        cliPath: options.cliPath || process.env.CODEX_TO_LLM_CLI_PATH,
        configHome: options.configHome || process.env.CODEX_TO_LLM_CONFIG_HOME,
        cwd: options.cwd || process.env.CODEX_TO_LLM_WORKSPACE,
        reasoningEffort: options.reasoningEffort || process.env.CODEX_TO_LLM_REASONING_EFFORT,
        sandbox: options.sandbox || process.env.CODEX_TO_LLM_SANDBOX
    };
}
function resolveModels(options) {
    const configured = options.models || process.env.CODEX_TO_LLM_SERVER_MODELS;
    if (Array.isArray(configured)) {
        return configured;
    }
    if (typeof configured === "string" && configured.trim()) {
        return configured.split(",").map(value => value.trim()).filter(Boolean);
    }
    return [options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL];
}
function assertAuthorized(request, apiKey) {
    if (!apiKey) {
        return;
    }
    const authorization = request.headers.authorization || "";
    if (authorization === `Bearer ${apiKey}`) {
        return;
    }
    throw createHttpError(401, "Missing or invalid bearer token");
}
function validateResponsesRequest(body) {
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
function validateRequestedModel(model, models) {
    if (!model) {
        return;
    }
    if (!models.includes(model)) {
        throw createHttpError(400, `Unsupported model: ${model}`);
    }
}
function requestToCoreInput(body) {
    return {
        instructions: body.instructions,
        input: typeof body.input === "string" || Array.isArray(body.input) ? body.input : JSON.stringify(body.input ?? "")
    };
}
function requestToRunOptions(body, options) {
    validateReasoningEffort(body.reasoning?.effort);
    validateMaxOutputTokens(body.max_output_tokens);
    return {
        model: body.model || options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL,
        maxTokens: body.max_output_tokens ?? undefined,
        reasoningEffort: body.reasoning?.effort ?? undefined
    };
}
function validateReasoningEffort(effort) {
    if (effort == null) {
        return;
    }
    if (!VALID_REASONING_EFFORTS.has(effort)) {
        throw createHttpError(400, "Invalid reasoning.effort");
    }
}
function validateMaxOutputTokens(maxOutputTokens) {
    if (maxOutputTokens == null) {
        return;
    }
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
        throw createHttpError(400, "Invalid max_output_tokens");
    }
}
async function streamOpenAIResponse(response, runner, coreInput, runOptions) {
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
    }
    catch (error) {
        hasError = true;
        writeSse(response, "response.failed", createErrorBody("server_error", error instanceof Error ? error.message : String(error)));
    }
    if (!hasError && !finalResponse) {
        hasError = true;
        writeSse(response, "response.failed", createErrorBody("server_error", "Runner stream ended without a completed response"));
    }
    if (!hasError) {
        response.write("data: [DONE]\n\n");
    }
    response.end();
    return finalResponse;
}
async function readJsonBody(request) {
    const chunks = [];
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
        return JSON.parse(rawBody);
    }
    catch {
        throw createHttpError(400, "Request body must be valid JSON");
    }
}
function buildModelsResponse(models) {
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
function normalizeServerPort(value) {
    const numericPort = typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
            ? Number.parseInt(value, 10)
            : Number.NaN;
    if (!Number.isInteger(numericPort) || numericPort < 0 || numericPort > 65535) {
        throw new Error("Invalid server port: expected an integer between 0 and 65535");
    }
    return numericPort;
}
function sendJson(response, statusCode, body) {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}
function writeSse(response, eventName, data) {
    response.write(`event: ${eventName}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
}
function createErrorBody(type, message) {
    return {
        error: {
            type,
            message
        }
    };
}
function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}
function isHttpError(error) {
    return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}
function isObjectWithInput(input) {
    return typeof input === "object" && input !== null && !Array.isArray(input) && "input" in input;
}
//# sourceMappingURL=index.js.map