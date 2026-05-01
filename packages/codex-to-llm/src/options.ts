import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SANDBOX,
  DEFAULT_WEB_SEARCH,
  type NormalizedRunOptions,
  type RunOptions,
  type WebSearchMode
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const CLI_TOKEN_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export function normalizeRunOptions(options: RunOptions = {}): NormalizedRunOptions {
  return {
    model: normalizeCliToken(options.model, DEFAULT_MODEL, "model"),
    reasoningEffort: normalizeCliToken(
      options.reasoningEffort,
      DEFAULT_REASONING_EFFORT,
      "reasoning effort"
    ),
    maxTokens: normalizeMaxTokens(options.maxTokens),
    sandbox: normalizeCliToken(options.sandbox, DEFAULT_SANDBOX, "sandbox"),
    timeoutMs: normalizeTimeout(options.timeout),
    cliPath: normalizeCliPath(options.cliPath),
    webSearch: normalizeWebSearch(options.webSearch, process.env.CODEX_TO_LLM_WEB_SEARCH),
    ignoreRules: normalizeBooleanOption(
      options.ignoreRules,
      process.env.CODEX_TO_LLM_IGNORE_RULES,
      "ignoreRules"
    ),
    ignoreUserConfig: normalizeBooleanOption(
      options.ignoreUserConfig,
      process.env.CODEX_TO_LLM_IGNORE_USER_CONFIG,
      "ignoreUserConfig"
    )
  };
}

function normalizeCliPath(value: string | undefined): string {
  const normalized = value || process.env.CODEX_TO_LLM_CLI_PATH || "codex";
  if (!normalized.trim()) {
    throw new Error("Invalid cliPath: expected a non-empty path or command");
  }
  return normalized;
}

function normalizeCliToken(value: string | undefined, fallback: string, fieldName: string): string {
  const normalized = value || fallback;
  if (!CLI_TOKEN_PATTERN.test(normalized) || normalized.startsWith("-")) {
    throw new Error(
      `Invalid ${fieldName}: expected letters, digits, dots, colons, slashes, underscores, or hyphens`
    );
  }
  return normalized;
}

function normalizeWebSearch(
  value: RunOptions["webSearch"],
  envValue: string | undefined
): WebSearchMode {
  if (typeof value === "boolean") {
    return value ? "live" : "disabled";
  }

  const normalized =
    value ||
    (typeof envValue === "string" && envValue.trim() ? envValue.trim().toLowerCase() : undefined) ||
    DEFAULT_WEB_SEARCH;

  if (normalized === "disabled" || normalized === "cached" || normalized === "live") {
    return normalized;
  }

  throw new Error('Invalid webSearch: expected "disabled", "cached", or "live"');
}

function normalizeBooleanOption(
  value: boolean | undefined,
  envValue: string | undefined,
  fieldName: string
): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (envValue == null || !envValue.trim()) {
    return false;
  }
  const normalized = envValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid ${fieldName}: expected a boolean value`);
}

function normalizeTimeout(value: number | undefined): number {
  if (value == null) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid timeout: expected a positive integer number of milliseconds");
  }
  return value;
}

function normalizeMaxTokens(value: number | undefined): number {
  if (value == null) {
    return DEFAULT_MAX_TOKENS;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid maxTokens: expected a positive integer");
  }
  return value;
}
