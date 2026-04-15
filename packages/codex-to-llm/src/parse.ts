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

function isTurnCompletedEvent(event: Record<string, unknown>): event is TurnCompletedEvent {
  return event.type === "turn.completed";
}

export function parseCodexEvents(stdout: string): ParsedCodexEvents {
  const events: unknown[] = [];
  let content = "";
  let usage = createEmptyUsage();

  for (const rawLine of stdout.split(/\r?\n/)) {
    const event = parseCodexEventLine(rawLine);
    if (!event) {
      continue;
    }
    events.push(event);

    if (isAgentMessageEvent(event)) {
      content = content ? `${content}\n\n${event.item.text}` : event.item.text;
    }

    if (isTurnCompletedEvent(event) && event.usage) {
      usage = normalizeUsage(event.usage);
    }
  }

  return { content, usage, events };
}

export function parseCodexEventLine(rawLine: string): Record<string, unknown> | null {
  const line = String(rawLine || "").trim();
  if (!line) {
    return null;
  }

  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function isAgentMessageEvent(
  event: Record<string, unknown>
): event is AgentMessageEvent & { item: { type: "agent_message"; text: string } } {
  return (
    event?.type === "item.completed" &&
    typeof event.item === "object" &&
    event.item !== null &&
    "type" in event.item &&
    event.item.type === "agent_message" &&
    "text" in event.item &&
    typeof event.item.text === "string" &&
    event.item.text.length > 0
  );
}

export function createEmptyUsage(): UsageSummary {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  };
}

export function normalizeUsage(usage: TurnCompletedEvent["usage"]): UsageSummary {
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
