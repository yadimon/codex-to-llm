import { createHttpError } from "./http-io.js";
import {
  SUPPORTED_ROLES,
  TEXT_BLOCK_TYPES,
  type ConversationMessageInput,
  type MessageRole,
  type MessageTextBlock,
  type ResponsesRequestBody,
  type ServerPromptInput
} from "./types.js";

export function requestToPrompt(body: ResponsesRequestBody): string {
  return serializeServerPrompt({
    instructions: body.instructions,
    input: body.input
  });
}

export function serializeServerPrompt(input: ServerPromptInput): string {
  const normalized = normalizeServerPromptInput(input);
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

export function normalizeServerPromptInput(input: ServerPromptInput): {
  instructions?: string;
  messages: Array<{ role: MessageRole; content: string }>;
} {
  const instructions =
    input.instructions == null ? undefined : normalizeText(input.instructions, "instructions");
  const messages: Array<{ role: MessageRole; content: string }> = [];
  const source = input.input;

  if (typeof source === "string") {
    messages.push({
      role: "user",
      content: normalizeText(source, "input")
    });
  } else if (Array.isArray(source)) {
    messages.push(...normalizeMessageEntries(source, "user"));
  } else if (source && typeof source === "object") {
    if (source.messages != null) {
      if (!Array.isArray(source.messages)) {
        throw createHttpError(400, "input.messages must be an array");
      }
      messages.push(...normalizeMessageEntries(source.messages));
    }

    if (source.input != null) {
      if (typeof source.input !== "string" && !Array.isArray(source.input)) {
        throw createHttpError(400, "input.input must be a string or an array of messages");
      }
      messages.push(...normalizeMessageEntries(source.input, "user"));
    }

    if (source.messages == null && source.input == null) {
      throw createHttpError(400, "input object must contain 'messages' or 'input'");
    }
  } else {
    throw createHttpError(400, "input must be a string, a message array, or { messages, input }");
  }

  if (messages.length === 0) {
    throw createHttpError(400, "input is required");
  }

  return { instructions, messages };
}

function normalizeMessageEntries(
  entries: string | ConversationMessageInput[],
  defaultRole?: MessageRole
): Array<{ role: MessageRole; content: string }> {
  if (typeof entries === "string") {
    return [{ role: defaultRole || "user", content: normalizeText(entries, "message") }];
  }
  return entries.map((entry, index) => normalizeMessage(entry, defaultRole, index));
}

function normalizeMessage(
  entry: ConversationMessageInput,
  defaultRole: MessageRole | undefined,
  index: number
): { role: MessageRole; content: string } {
  if (!entry || typeof entry !== "object") {
    throw createHttpError(400, `Message at index ${index} must be an object`);
  }
  const role = entry.role || defaultRole;
  if (!role || !SUPPORTED_ROLES.has(role)) {
    throw createHttpError(400, `Unsupported message role: ${role}`);
  }
  return {
    role,
    content: normalizeMessageContent(entry.content, `content for message ${index}`)
  };
}

function normalizeMessageContent(content: string | MessageTextBlock[], label: string): string {
  if (typeof content === "string") {
    return normalizeText(content, label);
  }
  if (!Array.isArray(content)) {
    throw createHttpError(400, `${label} must be a string or text block array`);
  }
  const blocks = content.map((block, index) => {
    if (!block || typeof block !== "object") {
      throw createHttpError(400, `${label} block ${index} must be an object`);
    }
    if (!TEXT_BLOCK_TYPES.has(block.type) || typeof block.text !== "string") {
      throw createHttpError(400, `${label} block ${index} must be a supported text block`);
    }
    return normalizeText(block.text, `${label} block ${index}`);
  });
  return blocks.join("\n\n");
}

function normalizeText(value: string, label: string): string {
  if (typeof value !== "string") {
    throw createHttpError(400, `${label} must be a string`);
  }
  if (!value.trim()) {
    throw createHttpError(400, `${label} must not be empty`);
  }
  return value;
}
