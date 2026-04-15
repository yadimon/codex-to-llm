import type { ParsedCodexEvents, UsageSummary } from "./types.js";
type AgentMessageEvent = {
    type: "item.completed";
    item?: {
        type?: string;
        text?: string;
    };
};
type TurnCompletedEvent = {
    type: "turn.completed";
    usage?: {
        input_tokens?: number;
        cached_input_tokens?: number;
        output_tokens?: number;
    };
};
export declare function parseCodexEvents(stdout: string): ParsedCodexEvents;
export declare function parseCodexEventLine(rawLine: string): Record<string, unknown> | null;
export declare function isAgentMessageEvent(event: Record<string, unknown>): event is AgentMessageEvent & {
    item: {
        type: "agent_message";
        text: string;
    };
};
export declare function createEmptyUsage(): UsageSummary;
export declare function normalizeUsage(usage: TurnCompletedEvent["usage"]): UsageSummary;
export {};
//# sourceMappingURL=parse.d.ts.map