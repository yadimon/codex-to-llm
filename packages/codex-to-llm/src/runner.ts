import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  createEmptyUsage,
  isAgentMessageEvent,
  isErrorEvent,
  isTurnFailedEvent,
  normalizeUsage,
  parseCodexEventLine
} from "./parse.js";
import { assertCliPathExists, normalizeSpawnError } from "./platform.js";
import { AsyncQueue } from "./queue.js";
import { resolveSpawn } from "./spawn.js";
import {
  createCodexHome,
  createWorkspace,
  cleanupDirectory
} from "./workspace.js";
import { terminate } from "./lifecycle.js";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SANDBOX,
  DEFAULT_WEB_SEARCH,
  type WebSearchMode
} from "./types.js";
import type {
  CoreResponse,
  NormalizedRunOptions,
  ResponseShell,
  RunOptions,
  Runner,
  StreamEvent,
  UsageSummary
} from "./types.js";

export function createRunner(baseOptions: RunOptions = {}): Runner {
  return {
    runPrompt(prompt, options = {}) {
      return runPrompt(prompt, { ...baseOptions, ...options });
    },
    streamPrompt(prompt, options = {}) {
      return streamPrompt(prompt, { ...baseOptions, ...options });
    }
  };
}

export async function runPrompt(prompt: string, options: RunOptions = {}): Promise<CoreResponse> {
  const stream = streamPrompt(prompt, options);
  let completedResponse: CoreResponse | undefined;

  for await (const event of stream) {
    if (event.type === "response.completed") {
      completedResponse = event.response;
    }
  }

  if (!completedResponse) {
    throw new Error("Codex completed without a response payload");
  }

  return completedResponse;
}

export function streamPrompt(prompt: string, options: RunOptions = {}): AsyncIterable<StreamEvent> {
  if (typeof prompt !== "string") {
    throw new Error("Prompt must be a string");
  }

  if (!prompt.trim()) {
    throw new Error("Prompt must not be empty");
  }

  const normalizedOptions = normalizeRunOptions(options);
  const {
    model,
    reasoningEffort,
    maxTokens,
    sandbox,
    timeoutMs,
    cliPath,
    webSearch,
    ignoreRules,
    ignoreUserConfig
  } = normalizedOptions;
  assertCliPathExists(cliPath);
  const ownsWorkspace = !options.cwd;
  const ownsCodexHome = !options.configHome;
  let workspace: string | undefined;
  let codexHome: string | undefined;

  try {
    workspace = createWorkspace(options.cwd);
    codexHome = createCodexHome({
      authPath: options.authPath,
      configHome: options.configHome
    });
  } catch (error) {
    throw withCleanupPreserved(error, [
      () => cleanupDirectory(workspace, ownsWorkspace),
      () => cleanupDirectory(codexHome, ownsCodexHome)
    ]);
  }

  const responseId = options.responseId || `resp_${randomUUID().replace(/-/g, "")}`;
  const startedAt = Date.now();
  const queue = new AsyncQueue<StreamEvent>();
  const rawEvents: unknown[] = [];
  let settled = false;
  let content = "";
  let stderr = "";
  let stdoutBuffer = "";
  let lastErrorMessage = "";
  let usage: UsageSummary = createEmptyUsage();

  const cliArgs = [
    "exec",
    ...(ignoreUserConfig ? ["--ignore-user-config"] : []),
    ...(ignoreRules ? ["--ignore-rules"] : []),
    "--json",
    "--color",
    "never",
    "--sandbox",
    sandbox,
    "--ephemeral",
    "-C",
    workspace,
    "--skip-git-repo-check",
    "--disable",
    "undo",
    "--disable",
    "shell_tool",
    "--disable",
    "child_agents_md",
    "--disable",
    "apply_patch_freeform",
    "--disable",
    "remote_models",
    "--model",
    model,
    "-c",
    `model_reasoning_effort="${reasoningEffort}"`,
    "-c",
    `model_max_output_tokens=${maxTokens}`,
    "-c",
    `web_search="${webSearch}"`,
    "-"
  ];

  queue.push({
    type: "response.started",
    response: createResponseShell({
      responseId,
      model,
      prompt,
      startedAt
    })
  });

  const spawnConfig = resolveSpawn(cliPath, cliArgs);
  const child: ChildProcessWithoutNullStreams = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: workspace,
    env: {
      ...process.env,
      CODEX_HOME: codexHome
    },
    windowsHide: true
  });
  const timeoutHandle = setTimeout(() => {
    if (!settled) {
      finalizeFailure(new Error(`Codex execution timeout after ${timeoutMs}ms`));
    }
  }, timeoutMs);

  const signal = options.signal;
  const onAbort = () => {
    if (!settled) {
      finalizeFailure(buildAbortError(signal));
    }
  };
  if (signal) {
    if (signal.aborted) {
      setImmediate(onAbort);
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  function finalizeSuccess(): void {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeoutHandle);
    signal?.removeEventListener("abort", onAbort);
    flushStdoutBuffer();

    const response: CoreResponse = {
      ...createResponseShell({
        responseId,
        model,
        prompt,
        startedAt
      }),
      content,
      usage,
      raw: {
        stderr: stderr.trim(),
        events: rawEvents
      }
    };

    cleanupDirectory(workspace, ownsWorkspace);
    cleanupDirectory(codexHome, ownsCodexHome);
    queue.push({
      type: "response.completed",
      response
    });
    queue.close();
  }

  function finalizeFailure(error: Error): void {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeoutHandle);
    signal?.removeEventListener("abort", onAbort);
    flushStdoutBuffer();

    queue.push({
      type: "response.failed",
      error: {
        message: error.message
      }
    });

    void terminate(child).catch(terminationError => {
      const reason = terminationError instanceof Error
        ? terminationError.message
        : String(terminationError);
      error.message = `${error.message} (termination failed: ${reason})`;
    }).finally(() => {
      cleanupDirectory(workspace, ownsWorkspace);
      cleanupDirectory(codexHome, ownsCodexHome);
      queue.fail(error);
    });
  }

  function flushStdoutBuffer(): void {
    if (!stdoutBuffer.trim()) {
      stdoutBuffer = "";
      return;
    }

    processStdoutLine(stdoutBuffer);
    stdoutBuffer = "";
  }

  function processStdoutLine(rawLine: string): void {
    const event = parseCodexEventLine(rawLine);
    if (!event) {
      return;
    }

    rawEvents.push(event);
    queue.push({
      type: "response.raw_event",
      event
    });

    if (isAgentMessageEvent(event)) {
      content = content ? `${content}\n\n${event.item.text}` : event.item.text;
      queue.push({
        type: "response.output_text.delta",
        delta: event.item.text
      });
    }

    if (isErrorEvent(event)) {
      lastErrorMessage = event.message;
    }

    if (isTurnFailedEvent(event)) {
      lastErrorMessage = event.error.message;
    }

    if (event.type === "turn.completed" && "usage" in event) {
      try {
        const eventUsage = event.usage;
        if (typeof eventUsage === "object" && eventUsage !== null) {
          usage = normalizeUsage(eventUsage as {
            input_tokens?: number;
            cached_input_tokens?: number;
            output_tokens?: number;
          });
        }
      } catch (error) {
        stderr += `\n[WARNING] Failed to parse usage: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }
  }

  child.stdout.on("data", chunk => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      processStdoutLine(line);
    }
  });

  child.stderr.on("data", chunk => {
    stderr = appendBounded(stderr, chunk.toString());
  });

  child.stdin.on("error", error => {
    finalizeFailure(error instanceof Error ? error : new Error(String(error)));
  });

  child.on("error", error => {
    finalizeFailure(normalizeSpawnError(error, cliPath));
  });

  child.on("close", (code, signal) => {
    setImmediate(() => {
      const exitError = createCodexExitError(code, signal, stderr, lastErrorMessage);
      if (exitError) {
        finalizeFailure(exitError);
        return;
      }

      finalizeSuccess();
    });
  });

  try {
    child.stdin.end(prompt);
  } catch (error) {
    finalizeFailure(error instanceof Error ? error : new Error(String(error)));
  }

  return queue;
}

export const execCodex = runPrompt;

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_STDERR_LENGTH = 64 * 1024;
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

function buildAbortError(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === "string" && reason.length > 0) {
    return new Error(reason);
  }
  return new Error("Aborted by client");
}

function appendBounded(current: string, nextChunk: string): string {
  const combined = current + nextChunk;
  if (combined.length <= MAX_STDERR_LENGTH) {
    return combined;
  }

  const tailLength = MAX_STDERR_LENGTH - "\n[stderr truncated]".length;
  return `${combined.slice(-tailLength)}\n[stderr truncated]`;
}

export function createCodexExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
  errorMessage = ""
): Error | undefined {
  const normalizedStderr = stderr.trim();
  if (signal) {
    return new Error(normalizedStderr || errorMessage || `Codex exited due to signal ${signal}`);
  }

  if (code !== 0) {
    return new Error(normalizedStderr || errorMessage || `Codex exited with code ${code}`);
  }

  return undefined;
}

function withCleanupPreserved(error: unknown, cleanupTasks: Array<() => void>): Error {
  const originalError = error instanceof Error ? error : new Error(String(error));

  for (const cleanupTask of cleanupTasks) {
    try {
      cleanupTask();
    } catch (cleanupError) {
      originalError.message = `${originalError.message} (cleanup failed: ${
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      })`;
    }
  }

  return originalError;
}

function createResponseShell({
  responseId,
  model,
  prompt,
  startedAt
}: {
  responseId: string;
  model: string;
  prompt: string;
  startedAt: number;
}): ResponseShell {
  return {
    id: responseId,
    model,
    prompt,
    createdAt: Math.floor(startedAt / 1000)
  };
}
