import type { ConversationInput, CoreResponse, RunOptions, Runner, StreamEvent } from "./types.js";
export declare function createRunner(baseOptions?: RunOptions): Runner;
export declare function runResponse(input: ConversationInput, options?: RunOptions): Promise<CoreResponse>;
export declare function streamResponse(input: ConversationInput, options?: RunOptions): AsyncIterable<StreamEvent>;
export declare const execCodex: typeof runResponse;
//# sourceMappingURL=runner.d.ts.map