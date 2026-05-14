import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import type { HttpError, ResponsesRequestBody } from "./types.js";

const MAX_BODY_SIZE = 10 * 1024 * 1024;

export function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export async function writeSse(
  response: ServerResponse,
  eventName: string,
  data: unknown
): Promise<void> {
  if (response.writableEnded) {
    return;
  }
  response.write(`event: ${eventName}\n`);
  const drained = response.write(`data: ${JSON.stringify(data)}\n\n`);
  if (!drained && !response.writableEnded) {
    await Promise.race([once(response, "drain"), once(response, "close")]);
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<ResponsesRequestBody> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > MAX_BODY_SIZE) {
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

export function createErrorBody(type: string, message: string) {
  return { error: { type, message } };
}

export function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    typeof (error as HttpError).statusCode === "number"
  );
}
