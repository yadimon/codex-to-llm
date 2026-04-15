import type { ConversationInput, ConversationMessageInput, MessageTextBlock, NormalizedConversationInput, NormalizedMessage } from "./types.js";
export declare function normalizeConversationInput(input: ConversationInput): NormalizedConversationInput;
export declare function normalizeText(value: string, label: string): string;
export declare function normalizeMessageEntries(entries: string | ConversationMessageInput[], defaultRole?: NormalizedMessage["role"]): NormalizedMessage[];
export declare function normalizeMessage(entry: ConversationMessageInput, defaultRole: NormalizedMessage["role"] | undefined, index: number): NormalizedMessage;
export declare function normalizeMessageContent(content: string | MessageTextBlock[], label: string): string;
//# sourceMappingURL=normalize.d.ts.map