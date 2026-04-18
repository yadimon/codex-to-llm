export const DEFAULT_MODEL = "gpt-5.3-codex-spark";
export const DEFAULT_REASONING_EFFORT = "low";
export const DEFAULT_MAX_TOKENS = 64;
export const DEFAULT_SANDBOX = "read-only";

export interface RunOptions {
  model?: string;
  reasoningEffort?: string;
  maxTokens?: number;
  timeout?: number;
  sandbox?: string;
  cliPath?: string;
  authPath?: string;
  configHome?: string;
  cwd?: string;
  responseId?: string;
}

export interface NormalizedRunOptions {
  model: string;
  reasoningEffort: string;
  maxTokens: number;
  timeoutMs: number;
  sandbox: string;
  cliPath: string;
}

export interface UsageSummary {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CoreResponse {
  id: string;
  model: string;
  prompt: string;
  createdAt: number;
  content: string;
  usage: UsageSummary;
  raw: {
    stderr: string;
    events: unknown[];
  };
}

export type ResponseShell = Omit<CoreResponse, "content" | "usage" | "raw">;

export type StreamEvent =
  | { type: "response.started"; response: ResponseShell }
  | { type: "response.output_text.delta"; delta: string }
  | { type: "response.raw_event"; event: unknown }
  | { type: "response.completed"; response: CoreResponse }
  | { type: "response.failed"; error: { message: string } };

export interface ParsedCodexEvents {
  content: string;
  usage: UsageSummary;
  events: unknown[];
}

export interface Runner {
  runPrompt(prompt: string, options?: RunOptions): Promise<CoreResponse>;
  streamPrompt(prompt: string, options?: RunOptions): AsyncIterable<StreamEvent>;
}

export interface SpawnResolution {
  command: string;
  args: string[];
}
