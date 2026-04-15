import { normalizeConversationInput } from "./normalize.js";
export function serializeConversationInput(input) {
    const normalized = normalizeConversationInput(input);
    const sections = [
        "You are being called through a stateless LLM adapter.",
        "Use the conversation exactly as provided and answer as the assistant."
    ];
    if (normalized.instructions) {
        sections.push(`## Instructions\n${normalized.instructions}`);
    }
    const conversation = normalized.messages
        .map(message => `### ${message.role}\n${message.content}`)
        .join("\n\n");
    sections.push(`## Conversation\n${conversation}`);
    sections.push("## Assistant Response\nRespond to the latest conversation turn.");
    return sections.join("\n\n");
}
//# sourceMappingURL=serialize.js.map