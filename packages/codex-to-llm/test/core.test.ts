import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRunOptions,
  normalizeSpawnError,
  normalizeConversationInput,
  serializeConversationInput
} from "../src/index.js";

test("normalizeConversationInput supports string prompts", () => {
  const normalized = normalizeConversationInput("Hello");

  assert.deepEqual(normalized, {
    instructions: undefined,
    messages: [
      {
        role: "user",
        content: "Hello"
      }
    ]
  });
});

test("normalizeConversationInput supports instructions plus message arrays", () => {
  const normalized = normalizeConversationInput({
    instructions: "Answer briefly.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Hello" },
          { type: "text", text: "again" }
        ]
      }
    ]
  });

  assert.equal(normalized.instructions, "Answer briefly.");
  assert.deepEqual(normalized.messages, [
    {
      role: "user",
      content: "Hello\n\nagain"
    }
  ]);
});

test("serializeConversationInput emits deterministic prompt sections", () => {
  const prompt = serializeConversationInput({
    instructions: "Answer briefly.",
    messages: [
      { role: "system", content: "Stay on topic." },
      { role: "user", content: "Hello" }
    ]
  });

  assert.match(prompt, /## Instructions/);
  assert.match(prompt, /### system/);
  assert.match(prompt, /### user/);
  assert.match(prompt, /## Assistant Response/);
});

test("serializeConversationInput preserves leading spaces and trailing newlines", () => {
  const prompt = serializeConversationInput({
    messages: [
      {
        role: "user",
        content: "  line one\nline two\n\n"
      }
    ]
  });

  assert.equal(prompt.includes("### user\n  line one\nline two\n\n"), true);
});

test("normalizeRunOptions rejects invalid CLI-facing values", () => {
  assert.throws(
    () => normalizeRunOptions({ reasoningEffort: 'high"; bad' }),
    /Invalid reasoning effort/
  );
  assert.throws(
    () => normalizeRunOptions({ model: "--bad-model" }),
    /Invalid model/
  );
  assert.throws(
    () => normalizeRunOptions({ sandbox: "workspace write" }),
    /Invalid sandbox/
  );
});

test("normalizeRunOptions rejects invalid timeout values", () => {
  assert.throws(
    () => normalizeRunOptions({ timeout: -1 }),
    /Invalid timeout/
  );
  assert.throws(
    () => normalizeRunOptions({ timeout: Number.NaN }),
    /Invalid timeout/
  );
  assert.equal(normalizeRunOptions({ timeout: 1500.9 }).timeoutMs, 1500);
});

test("normalizeSpawnError provides targeted permission errors", () => {
  const error = normalizeSpawnError({ code: "EACCES" }, "codex");

  assert.match(error.message, /not executable/);
});
