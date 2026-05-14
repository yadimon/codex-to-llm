import type { RunOptions, WebSearchMode } from "@yadimon/codex-to-llm";
import { DEFAULT_MODEL } from "@yadimon/codex-to-llm";
import type { ServerOptions } from "./types.js";

export function resolveModels(options: ServerOptions): { models: string[]; defaultModel: string } {
  const list = parseModelList(options);
  if (list.length === 0) {
    throw new Error(
      "No models configured: set CODEX_TO_LLM_SERVER_MODELS or pass options.models with at least one entry"
    );
  }
  const defaultModel =
    options.defaultModel ||
    process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL ||
    list[0];
  if (!list.includes(defaultModel)) {
    throw new Error(
      `Default model "${defaultModel}" is not in the configured models list [${list.join(", ")}]`
    );
  }
  return { models: list, defaultModel };
}

function parseModelList(options: ServerOptions): string[] {
  const configured = options.models ?? process.env.CODEX_TO_LLM_SERVER_MODELS;
  if (Array.isArray(configured)) {
    return configured.map(value => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  }
  if (typeof configured === "string" && configured.trim()) {
    return configured.split(",").map(value => value.trim()).filter(Boolean);
  }
  return [options.defaultModel || process.env.CODEX_TO_LLM_SERVER_DEFAULT_MODEL || DEFAULT_MODEL];
}

export function normalizeServerPort(value: number | string): number {
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

export function defaultRunnerOptions(options: ServerOptions): RunOptions {
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
      options.ignoreUserConfig ?? readBooleanEnv("CODEX_TO_LLM_IGNORE_USER_CONFIG"),
    envPassthrough: options.envPassthrough
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
