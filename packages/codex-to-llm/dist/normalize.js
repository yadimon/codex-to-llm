const SUPPORTED_ROLES = new Set([
    "system",
    "developer",
    "user",
    "assistant"
]);
const TEXT_BLOCK_TYPES = new Set([
    "text",
    "input_text",
    "output_text"
]);
export function normalizeConversationInput(input) {
    if (typeof input === "string") {
        return {
            instructions: undefined,
            messages: [
                {
                    role: "user",
                    content: normalizeText(input, "input")
                }
            ]
        };
    }
    if (Array.isArray(input)) {
        return {
            instructions: undefined,
            messages: normalizeMessageEntries(input, "user")
        };
    }
    if (!input || typeof input !== "object") {
        throw new Error("Input must be a string, message array, or request object");
    }
    const instructions = input.instructions == null ? undefined : normalizeText(input.instructions, "instructions");
    const messages = [];
    if (input.messages != null) {
        if (!Array.isArray(input.messages)) {
            throw new Error("messages must be an array");
        }
        messages.push(...normalizeMessageEntries(input.messages));
    }
    if (input.input != null) {
        messages.push(...normalizeMessageEntries(input.input, "user"));
    }
    if (messages.length === 0) {
        throw new Error("At least one message or input value is required");
    }
    return { instructions, messages };
}
export function normalizeText(value, label) {
    if (typeof value !== "string") {
        throw new Error(`${label} must be a string`);
    }
    if (!value.trim()) {
        throw new Error(`${label} must not be empty`);
    }
    return value;
}
export function normalizeMessageEntries(entries, defaultRole) {
    if (typeof entries === "string") {
        return [
            {
                role: defaultRole || "user",
                content: normalizeText(entries, "message")
            }
        ];
    }
    if (!Array.isArray(entries)) {
        throw new Error("messages must be provided as a string or array");
    }
    return entries.map((entry, index) => normalizeMessage(entry, defaultRole, index));
}
export function normalizeMessage(entry, defaultRole, index) {
    if (!entry || typeof entry !== "object") {
        throw new Error(`Message at index ${index} must be an object`);
    }
    const role = entry.role || defaultRole;
    if (!role || !SUPPORTED_ROLES.has(role)) {
        throw new Error(`Unsupported message role: ${role}`);
    }
    return {
        role,
        content: normalizeMessageContent(entry.content, `content for message ${index}`)
    };
}
export function normalizeMessageContent(content, label) {
    if (typeof content === "string") {
        return normalizeText(content, label);
    }
    if (!Array.isArray(content)) {
        throw new Error(`${label} must be a string or text block array`);
    }
    const blocks = content.map((block, index) => {
        if (!block || typeof block !== "object") {
            throw new Error(`${label} block ${index} must be an object`);
        }
        if (!TEXT_BLOCK_TYPES.has(block.type) || typeof block.text !== "string") {
            throw new Error(`${label} block ${index} must be a supported text block`);
        }
        return normalizeText(block.text, `${label} block ${index}`);
    });
    return blocks.join("\n\n");
}
//# sourceMappingURL=normalize.js.map