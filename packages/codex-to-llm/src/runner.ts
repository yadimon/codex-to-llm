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
import { buildChildEnv } from "./env.js";
import { buildCodexArgs } from "./codex-args.js";
import { normalizeRunOptions } from "./options.js";
import { appendBounded, buildAbortError, createCodexExitError } from "./exit.js";
import type {
  CoreResponse,
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
  const { model, timeoutMs, cliPath } = normalizedOptions;
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

  const cliArgs = buildCodexArgs(normalizedOptions, workspace);

  queue.push({
    type: "response.started",
    response: createResponseShell({ responseId, model, prompt, startedAt })
  });

  const spawnConfig = resolveSpawn(cliPath, cliArgs);
  const child: ChildProcessWithoutNullStreams = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: workspace,
    env: buildChildEnv({ codexHome, envPassthrough: options.envPassthrough }),
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
      ...createResponseShell({ responseId, model, prompt, startedAt }),
      content,
      usage,
      raw: { stderr: stderr.trim(), events: rawEvents }
    };

    cleanupDirectory(workspace, ownsWorkspace);
    cleanupDirectory(codexHome, ownsCodexHome);
    queue.push({ type: "response.completed", response });
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

    queue.push({ type: "response.failed", error: { message: error.message } });

    void terminate(child)
      .catch(terminationError => {
        const reason = terminationError instanceof Error
          ? terminationError.message
          : String(terminationError);
        error.message = `${error.message} (termination failed: ${reason})`;
      })
      .finally(() => {
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
    queue.push({ type: "response.raw_event", event });

    if (isAgentMessageEvent(event)) {
      content = content ? `${content}\n\n${event.item.text}` : event.item.text;
      queue.push({ type: "response.output_text.delta", delta: event.item.text });
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

  child.on("close", (code, signalCode) => {
    setImmediate(() => {
      const exitError = createCodexExitError(code, signalCode, stderr, lastErrorMessage);
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
