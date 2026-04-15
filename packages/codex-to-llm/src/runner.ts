import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { normalizeConversationInput } from "./normalize.js";
import { createEmptyUsage, isAgentMessageEvent, normalizeUsage, parseCodexEventLine } from "./parse.js";
import { assertCliPathExists, normalizeSpawnError } from "./platform.js";
import { AsyncQueue } from "./queue.js";
import { serializeConversationInput } from "./serialize.js";
import { resolveSpawn } from "./spawn.js";
import {
  createCodexHome,
  createWorkspace,
  cleanupDirectory
} from "./workspace.js";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_SANDBOX
} from "./types.js";
import type {
  ConversationInput,
  CoreResponse,
  ResponseShell,
  RunOptions,
  Runner,
  StreamEvent,
  UsageSummary
} from "./types.js";

export function createRunner(baseOptions: RunOptions = {}): Runner {
  return {
    runResponse(input, options = {}) {
      return runResponse(input, { ...baseOptions, ...options });
    },
    streamResponse(input, options = {}) {
      return streamResponse(input, { ...baseOptions, ...options });
    }
  };
}

export async function runResponse(input: ConversationInput, options: RunOptions = {}): Promise<CoreResponse> {
  const stream = streamResponse(input, options);
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

export function streamResponse(
  input: ConversationInput,
  options: RunOptions = {}
): AsyncIterable<StreamEvent> {
  const normalizedInput = normalizeConversationInput(input);
  const prompt = serializeConversationInput(normalizedInput);
  const model = options.model || DEFAULT_MODEL;
  const reasoningEffort = options.reasoningEffort || DEFAULT_REASONING_EFFORT;
  const maxTokens = Number.isFinite(options.maxTokens) ? Number(options.maxTokens) : DEFAULT_MAX_TOKENS;
  const sandbox = options.sandbox || DEFAULT_SANDBOX;
  const cliPath =
    options.cliPath || process.env.CODEX_TO_LLM_CLI_PATH || process.env.CODEX_CLI_PATH || "codex";
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
    cleanupDirectory(workspace, ownsWorkspace);
    cleanupDirectory(codexHome, ownsCodexHome);
    throw error;
  }

  const responseId = options.responseId || `resp_${randomUUID().replace(/-/g, "")}`;
  const startedAt = Date.now();
  const queue = new AsyncQueue<StreamEvent>();
  const rawEvents: unknown[] = [];
  let settled = false;
  let content = "";
  let stderr = "";
  let stdoutBuffer = "";
  let usage: UsageSummary = createEmptyUsage();
  const timeoutMs = options.timeout ?? 5 * 60 * 1000;

  const cliArgs = [
    "exec",
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
    "-"
  ];

  queue.push({
    type: "response.started",
    response: createResponseShell({
      responseId,
      model,
      normalizedInput,
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

  function finalizeSuccess(): void {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeoutHandle);
    flushStdoutBuffer();

    const response: CoreResponse = {
      ...createResponseShell({
        responseId,
        model,
        normalizedInput,
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
    if (!child.killed) {
      child.kill();
    }
    flushStdoutBuffer();

    cleanupDirectory(workspace, ownsWorkspace);
    cleanupDirectory(codexHome, ownsCodexHome);
    queue.push({
      type: "response.failed",
      error: {
        message: error.message
      }
    });
    queue.fail(error);
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
    stderr += chunk.toString();
  });

  child.stdin.on("error", error => {
    finalizeFailure(error instanceof Error ? error : new Error(String(error)));
  });

  child.on("error", error => {
    finalizeFailure(normalizeSpawnError(error, cliPath));
  });

  child.on("close", code => {
    setImmediate(() => {
      if (code && code !== 0) {
        finalizeFailure(new Error(stderr.trim() || `Codex exited with code ${code}`));
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

export const execCodex = runResponse;

function createResponseShell({
  responseId,
  model,
  normalizedInput,
  startedAt
}: {
  responseId: string;
  model: string;
  normalizedInput: ReturnType<typeof normalizeConversationInput>;
  startedAt: number;
}): ResponseShell {
  return {
    id: responseId,
    model,
    instructions: normalizedInput.instructions,
    messages: normalizedInput.messages,
    createdAt: Math.floor(startedAt / 1000)
  };
}
