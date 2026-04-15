import type { ConversationInput, CoreResponse, NormalizedRunOptions, RunOptions, Runner, StreamEvent } from "./types.js";
export declare function createRunner(baseOptions?: RunOptions): Runner;
export declare function runResponse(input: ConversationInput, options?: RunOptions): Promise<CoreResponse>;
export declare function streamResponse(input: ConversationInput, options?: RunOptions): AsyncIterable<StreamEvent>;
export declare const execCodex: typeof runResponse;
export declare function normalizeRunOptions(options?: RunOptions): NormalizedRunOptions;
export declare function createCodexExitError(code: number | null, signal: NodeJS.Signals | null, stderr: string): Error | undefined;
//# sourceMappingURL=runner.d.ts.map