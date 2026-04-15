export declare const DEFAULT_MODEL = "gpt-5.3-codex-spark";
export declare const DEFAULT_REASONING_EFFORT = "low";
export declare const DEFAULT_MAX_TOKENS = 64;
export declare const DEFAULT_SANDBOX = "read-only";
export interface RunOptions {
    model?: string;
    reasoningEffort?: string;
    maxTokens?: number;
    sandbox?: string;
    cliPath?: string;
    authPath?: string;
    configHome?: string;
    cwd?: string;
    responseId?: string;
}
export interface NormalizedMessage {
    role: "system" | "developer" | "user" | "assistant";
    content: string;
}
export interface NormalizedConversationInput {
    instructions?: string;
    messages: NormalizedMessage[];
}
export type MessageTextBlock = {
    type: "text" | "input_text" | "output_text";
    text: string;
};
export type ConversationMessageInput = {
    role?: NormalizedMessage["role"];
    content: string | MessageTextBlock[];
};
export type ConversationInput = string | ConversationMessageInput[] | {
    instructions?: string;
    messages?: ConversationMessageInput[];
    input?: string | ConversationMessageInput[];
};
export interface UsageSummary {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
export interface CoreResponse {
    id: string;
    model: string;
    instructions?: string;
    messages: NormalizedMessage[];
    createdAt: number;
    content: string;
    usage: UsageSummary;
    raw: {
        stderr: string;
        events: unknown[];
    };
}
export type ResponseShell = Omit<CoreResponse, "content" | "usage" | "raw">;
export type StreamEvent = {
    type: "response.started";
    response: ResponseShell;
} | {
    type: "response.output_text.delta";
    delta: string;
} | {
    type: "response.raw_event";
    event: unknown;
} | {
    type: "response.completed";
    response: CoreResponse;
} | {
    type: "response.failed";
    error: {
        message: string;
    };
};
export interface ParsedCodexEvents {
    content: string;
    usage: UsageSummary;
    events: unknown[];
}
export interface Runner {
    runResponse(input: ConversationInput, options?: RunOptions): Promise<CoreResponse>;
    streamResponse(input: ConversationInput, options?: RunOptions): AsyncIterable<StreamEvent>;
}
export interface SpawnResolution {
    command: string;
    args: string[];
}
//# sourceMappingURL=types.d.ts.map