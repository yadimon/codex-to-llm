import { type IncomingMessage, type ServerResponse } from "node:http";
import type { CoreResponse, ConversationInput, RunOptions, StreamEvent } from "@yadimon/codex-to-llm";
export interface ResponsesRequestBody {
    model?: string;
    stream?: boolean;
    input?: ConversationInput;
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
    runResponse(input: ConversationInput, options?: RunOptions): Promise<CoreResponse>;
    streamResponse(input: ConversationInput, options?: RunOptions): AsyncIterable<StreamEvent>;
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
export declare function createServer(options?: ServerOptions): {
    host: string;
    port: number;
    server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
};
export declare function startServer(options?: ServerOptions): Promise<{
    host: string;
    port: number;
    url: string;
    server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
    close(): Promise<void>;
}>;
export declare function buildOpenAIResponse(result: CoreResponse): {
    id: string;
    object: string;
    created_at: number;
    status: string;
    model: string;
    output: {
        id: string;
        type: string;
        role: string;
        status: string;
        content: {
            type: string;
            text: string;
            annotations: never[];
        }[];
    }[];
    output_text: string;
    usage: {
        input_tokens: number;
        input_tokens_details: {
            cached_tokens: number;
        };
        output_tokens: number;
        total_tokens: number;
    };
};
//# sourceMappingURL=index.d.ts.map