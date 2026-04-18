import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCodexExitError,
  runPrompt,
  normalizeRunOptions,
  normalizeSpawnError
} from "../src/index.js";

test("runPrompt rejects empty prompts before spawning codex", async () => {
  await assert.rejects(runPrompt("   "), /Prompt must not be empty/);
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

test("runPrompt fails when the codex process exits due to a signal", async () => {
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
      runPrompt("Hello", {
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
