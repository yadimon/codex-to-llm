import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexEvents } from "../src/index.js";

test("parseCodexEvents extracts content and usage", () => {
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "x" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Hi." } }),
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 }
    })
  ].join("\n");

  const parsed = parseCodexEvents(stdout);
  assert.equal(parsed.content, "Hi.");
  assert.deepEqual(parsed.usage, {
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 2,
    totalTokens: 12
  });
  assert.equal(parsed.events.length, 3);
});
