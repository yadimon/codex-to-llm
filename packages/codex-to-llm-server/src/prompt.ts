import { createHttpError } from "./http-io.js";
import {
  normalizeImageInputs,
  normalizeImageUrl,
  parseImageDataUrl,
  type ImageInput
} from "@yadimon/codex-to-llm";
import {
  SUPPORTED_ROLES,
  TEXT_BLOCK_TYPES,
  type ConversationMessageInput,
  type MessageImageBlock,
  type MessageContentBlock,
  type MessageRole,
  type ResponsesInput,
  type ResponsesRequestBody,
  type ServerPromptInput
} from "./types.js";

export function requestToPrompt(body: ResponsesRequestBody): string {
  return serializeServerPrompt({
    instructions: body.instructions,
    input: body.input
  });
}

export function requestToImageInputs(input: ResponsesInput | undefined): ImageInput[] {
  const images: ImageInput[] = [];

  function collectMessages(
    entries: ConversationMessageInput[],
    defaultRole?: MessageRole
  ): void {
    entries.forEach((entry, messageIndex) => {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.content)) {
        return;
      }
      const role = entry.role || defaultRole;
      entry.content.forEach((block, blockIndex) => {
        if (!block || typeof block !== "object" || block.type !== "input_image") {
          return;
        }
        if (role !== "user") {
          throw createHttpError(
            400,
            `input_image is only supported in user messages (message ${messageIndex}, block ${blockIndex})`
          );
        }
        images.push(normalizeInputImageBlock(block, messageIndex, blockIndex));
      });
    });
  }

  if (Array.isArray(input)) {
    collectMessages(input, "user");
  } else if (input && typeof input === "object") {
    if (Array.isArray(input.messages)) {
      collectMessages(input.messages);
    }
    if (Array.isArray(input.input)) {
      collectMessages(input.input, "user");
    }
  }

  try {
    normalizeImageInputs(images);
  } catch (error) {
    throw createHttpError(400, error instanceof Error ? error.message : String(error));
  }
  return images;
}

function normalizeInputImageBlock(
  block: MessageImageBlock,
  messageIndex: number,
  blockIndex: number
): ImageInput {
  const label = `input_image at message ${messageIndex}, block ${blockIndex}`;
  if (block.file_id != null) {
    throw createHttpError(400, `${label} file_id is not supported`);
  }
  if (block.detail != null && !["auto", "low", "high"].includes(block.detail)) {
    throw createHttpError(400, `${label} detail must be auto, low, or high`);
  }
  if (typeof block.image_url !== "string" || !block.image_url.trim()) {
    throw createHttpError(400, `${label} image_url must be a non-empty string`);
  }

  try {
    if (block.image_url.trim().toLowerCase().startsWith("data:")) {
      return parseImageDataUrl(block.image_url, `${label} image_url`);
    }
    return {
      type: "url",
      url: normalizeImageUrl(block.image_url, `${label} image_url`)
    };
  } catch (error) {
    throw createHttpError(400, error instanceof Error ? error.message : String(error));
  }
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

function normalizeMessageContent(content: string | MessageContentBlock[], label: string): string {
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
    if (block.type === "input_image") {
      return "";
    }
    if (!TEXT_BLOCK_TYPES.has(block.type) || typeof block.text !== "string") {
      throw createHttpError(400, `${label} block ${index} must be a supported text block`);
    }
    return normalizeText(block.text, `${label} block ${index}`);
  });
  return blocks.filter(Boolean).join("\n\n");
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
