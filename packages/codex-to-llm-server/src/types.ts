import type { CoreResponse, RunOptions, StreamEvent } from "@yadimon/codex-to-llm";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

export const UNSUPPORTED_REQUEST_FIELDS = [
  "tools",
  "tool_choice",
  "conversation",
  "previous_response_id",
  "input_audio",
  "input_image",
  "parallel_tool_calls"
] as const;

export const SSE_KEEPALIVE_MS = 15_000;
export const VALID_REASONING_EFFORTS = new Set(["low", "medium", "high"]);

export type MessageRole = "system" | "developer" | "user" | "assistant";
export const SUPPORTED_ROLES = new Set<MessageRole>(["system", "developer", "user", "assistant"]);

export type MessageTextBlock = {
  type: "text" | "input_text" | "output_text";
  text: string;
};
export const TEXT_BLOCK_TYPES = new Set<MessageTextBlock["type"]>([
  "text",
  "input_text",
  "output_text"
]);

export type ConversationMessageInput = {
  role?: MessageRole;
  content: string | MessageTextBlock[];
};

export type ResponsesInput =
  | string
  | ConversationMessageInput[]
  | {
      input?: string | ConversationMessageInput[];
      messages?: ConversationMessageInput[];
    };

export interface ResponsesRequestBody {
  model?: string;
  stream?: boolean;
  input?: ResponsesInput;
  instructions?: string;
  max_output_tokens?: number;
  reasoning?: {
    effort?: string;
  };
  tools?: unknown;
  tool_choice?: unknown;
  conversation?: unknown;
  previous_response_id?: unknown;
  input_audio?: unknown;
  input_image?: unknown;
  parallel_tool_calls?: unknown;
}

export interface Runner {
  runPrompt(prompt: string, options?: RunOptions): Promise<CoreResponse>;
  streamPrompt(prompt: string, options?: RunOptions): AsyncIterable<StreamEvent>;
}

export interface ServerOptions extends RunOptions {
  host?: string;
  port?: number;
  models?: string[] | string;
  defaultModel?: string;
  apiKey?: string;
  mockMode?: string | boolean;
  runner?: Runner;
}

export type ServerPromptInput = {
  instructions?: string;
  input?: ResponsesInput;
};

export type HttpError = Error & { statusCode: number };
