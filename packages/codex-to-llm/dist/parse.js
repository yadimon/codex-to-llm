function isTurnCompletedEvent(event) {
    return event.type === "turn.completed";
}
export function parseCodexEvents(stdout) {
    const events = [];
    let content = "";
    let usage = createEmptyUsage();
    for (const rawLine of stdout.split(/\r?\n/)) {
        const event = parseCodexEventLine(rawLine);
        if (!event) {
            continue;
        }
        events.push(event);
        if (isAgentMessageEvent(event)) {
            content = event.item.text;
        }
        if (isTurnCompletedEvent(event) && event.usage) {
            usage = normalizeUsage(event.usage);
        }
    }
    return { content, usage, events };
}
export function parseCodexEventLine(rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) {
        return null;
    }
    try {
        return JSON.parse(line);
    }
    catch {
        return null;
    }
}
export function isAgentMessageEvent(event) {
    return (event?.type === "item.completed" &&
        typeof event.item === "object" &&
        event.item !== null &&
        "type" in event.item &&
        event.item.type === "agent_message" &&
        "text" in event.item &&
        typeof event.item.text === "string");
}
export function createEmptyUsage() {
    return {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
    };
}
export function normalizeUsage(usage) {
    const inputTokens = usage?.input_tokens ?? 0;
    const cachedInputTokens = usage?.cached_input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    return {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
    };
}
//# sourceMappingURL=parse.js.map