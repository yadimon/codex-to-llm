import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCodexExitError,
  runResponse,
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
  assert.throws(
    () => normalizeRunOptions({ timeout: 1500.9 }),
    /Invalid timeout/
  );
});

test("normalizeRunOptions rejects invalid maxTokens values", () => {
  assert.throws(
    () => normalizeRunOptions({ maxTokens: -1 }),
    /Invalid maxTokens/
  );
  assert.throws(
    () => normalizeRunOptions({ maxTokens: 1.5 }),
    /Invalid maxTokens/
  );
});

test("normalizeRunOptions resolves cliPath from explicit options and environment", () => {
  const previousCliPath = process.env.CODEX_TO_LLM_CLI_PATH;
  process.env.CODEX_TO_LLM_CLI_PATH = "codex-from-env";

  try {
    assert.equal(normalizeRunOptions({}).cliPath, "codex-from-env");
    assert.equal(normalizeRunOptions({ cliPath: "custom-codex" }).cliPath, "custom-codex");
  } finally {
    if (previousCliPath == null) {
      delete process.env.CODEX_TO_LLM_CLI_PATH;
    } else {
      process.env.CODEX_TO_LLM_CLI_PATH = previousCliPath;
    }
  }
});

test("normalizeSpawnError provides targeted permission errors", () => {
  const error = normalizeSpawnError({ code: "EACCES" }, "codex");

  assert.match(error.message, /not executable/);
});

test("createCodexExitError prefers signal information over a generic success path", () => {
  assert.equal(createCodexExitError(0, null, ""), undefined);
  assert.match(createCodexExitError(null, "SIGTERM", "")?.message || "", /signal SIGTERM/);
  assert.match(createCodexExitError(1, null, "")?.message || "", /code 1/);
});

test("runResponse fails when the codex process exits due to a signal", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-signal-"));
  const authPath = path.join(tempDir, "auth.json");
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "./fixtures/fake-codex.mjs"
  );
  const cliPath =
    process.platform === "win32"
      ? path.join(tempDir, "fake-codex.cmd")
      : fixturePath;
  fs.writeFileSync(authPath, JSON.stringify({ access_token: "test-token" }), "utf8");
  if (process.platform === "win32") {
    fs.writeFileSync(cliPath, `@echo off\r\n"${process.execPath}" "${fixturePath}" %*\r\n`, "utf8");
  }

  const previousSignal = process.env.FAKE_CODEX_TERMINATE_SIGNAL;
  process.env.FAKE_CODEX_TERMINATE_SIGNAL = "SIGTERM";

  try {
    await assert.rejects(
      runResponse("Hello", {
        authPath,
        cliPath,
        timeout: 5000
      }),
      /signal SIGTERM|code 1/
    );
  } finally {
    if (previousSignal == null) {
      delete process.env.FAKE_CODEX_TERMINATE_SIGNAL;
    } else {
      process.env.FAKE_CODEX_TERMINATE_SIGNAL = previousSignal;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
