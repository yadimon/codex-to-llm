import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

export function logEvent(record: LogRecord): void {
  if (process.env.CODEX_TO_LLM_SERVER_LOG === "off") {
    return;
  }
  const payload = JSON.stringify({ ts: new Date().toISOString(), ...record });
  process.stdout.write(`${payload}\n`);
}

export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
