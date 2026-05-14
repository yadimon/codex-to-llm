import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createHttpError } from "./http-io.js";

export function assertAuthorized(request: IncomingMessage, apiKey?: string): void {
  if (!apiKey) {
    return;
  }
  const authorization = request.headers.authorization || "";
  if (!matchesBearerToken(authorization, apiKey)) {
    throw createHttpError(401, "Missing or invalid bearer token");
  }
}

function matchesBearerToken(authorization: string, apiKey: string): boolean {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
