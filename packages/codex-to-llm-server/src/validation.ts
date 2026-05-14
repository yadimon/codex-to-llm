import type { RunOptions } from "@yadimon/codex-to-llm";
import { createHttpError } from "./http-io.js";
import {
  UNSUPPORTED_REQUEST_FIELDS,
  VALID_REASONING_EFFORTS,
  type ResponsesRequestBody,
  type ServerOptions
} from "./types.js";

export function validateResponsesRequest(body: ResponsesRequestBody): void {
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

export function validateRequestedModel(model: string | undefined, models: string[]): void {
  if (!model) {
    return;
  }
  if (!models.includes(model)) {
    throw createHttpError(400, `Unsupported model: ${model}`);
  }
}

export function requestToRunOptions(
  body: ResponsesRequestBody,
  options: ServerOptions,
  defaultModel: string
): RunOptions {
  validateReasoningEffort(body.reasoning?.effort);
  validateMaxOutputTokens(body.max_output_tokens);

  return {
    model: body.model || defaultModel,
    maxTokens: body.max_output_tokens ?? undefined,
    reasoningEffort: body.reasoning?.effort ?? undefined,
    envPassthrough: options.envPassthrough
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
