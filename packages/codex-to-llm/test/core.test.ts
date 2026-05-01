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
  assert.throws(
    () => normalizeRunOptions({ webSearch: "fast" as "live" }),
    /Invalid webSearch/
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

test("normalizeRunOptions resolves web search and ignore flags from options and environment", () => {
  const previousWebSearch = process.env.CODEX_TO_LLM_WEB_SEARCH;
  const previousIgnoreRules = process.env.CODEX_TO_LLM_IGNORE_RULES;
  const previousIgnoreUserConfig = process.env.CODEX_TO_LLM_IGNORE_USER_CONFIG;
  process.env.CODEX_TO_LLM_WEB_SEARCH = "cached";
  process.env.CODEX_TO_LLM_IGNORE_RULES = "true";
  process.env.CODEX_TO_LLM_IGNORE_USER_CONFIG = "1";

  try {
    const fromEnv = normalizeRunOptions({});
    assert.equal(fromEnv.webSearch, "cached");
    assert.equal(fromEnv.ignoreRules, true);
    assert.equal(fromEnv.ignoreUserConfig, true);

    const fromOptions = normalizeRunOptions({
      webSearch: true,
      ignoreRules: false,
      ignoreUserConfig: false
    });
    assert.equal(fromOptions.webSearch, "live");
    assert.equal(fromOptions.ignoreRules, false);
    assert.equal(fromOptions.ignoreUserConfig, false);
  } finally {
    if (previousWebSearch == null) {
      delete process.env.CODEX_TO_LLM_WEB_SEARCH;
    } else {
      process.env.CODEX_TO_LLM_WEB_SEARCH = previousWebSearch;
    }

    if (previousIgnoreRules == null) {
      delete process.env.CODEX_TO_LLM_IGNORE_RULES;
    } else {
      process.env.CODEX_TO_LLM_IGNORE_RULES = previousIgnoreRules;
    }

    if (previousIgnoreUserConfig == null) {
      delete process.env.CODEX_TO_LLM_IGNORE_USER_CONFIG;
    } else {
      process.env.CODEX_TO_LLM_IGNORE_USER_CONFIG = previousIgnoreUserConfig;
    }
  }
});

test("normalizeSpawnError provides targeted permission errors", () => {
  const error = normalizeSpawnError({ code: "EACCES" }, "codex");

  assert.match(error.message, /not executable/);
});

test("createCodexExitError prefers stderr or parsed error messages over generic exit codes", () => {
  assert.equal(createCodexExitError(0, null, ""), undefined);
  assert.match(createCodexExitError(null, "SIGTERM", "")?.message || "", /signal SIGTERM/);
  assert.match(createCodexExitError(1, null, "")?.message || "", /code 1/);
  assert.match(
    createCodexExitError(1, null, "", "Incorrect API key provided")?.message || "",
    /Incorrect API key provided/
  );
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

test("runPrompt aborts when AbortSignal fires while codex is still running", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-abort-"));
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

  const previousHang = process.env.FAKE_CODEX_HANG;
  process.env.FAKE_CODEX_HANG = "1";

  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error("client gone")), 100);

  try {
    await assert.rejects(
      runPrompt("Hello", {
        authPath,
        cliPath,
        timeout: 30_000,
        signal: controller.signal
      }),
      /client gone|Aborted by client/
    );
  } finally {
    if (previousHang == null) {
      delete process.env.FAKE_CODEX_HANG;
    } else {
      process.env.FAKE_CODEX_HANG = previousHang;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runPrompt rejects immediately if signal is already aborted", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-abort-pre-"));
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

  const controller = new AbortController();
  controller.abort(new Error("preempted"));

  try {
    await assert.rejects(
      runPrompt("Hello", {
        authPath,
        cliPath,
        timeout: 30_000,
        signal: controller.signal
      }),
      /preempted|Aborted by client/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runPrompt escalates termination when codex ignores SIGTERM", { skip: process.platform === "win32" }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-escalate-"));
  const authPath = path.join(tempDir, "auth.json");
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "./fixtures/fake-codex.mjs"
  );

  fs.writeFileSync(authPath, JSON.stringify({ access_token: "test-token" }), "utf8");

  const previousHang = process.env.FAKE_CODEX_HANG;
  const previousIgnore = process.env.FAKE_CODEX_IGNORE_SIGTERM;
  process.env.FAKE_CODEX_HANG = "1";
  process.env.FAKE_CODEX_IGNORE_SIGTERM = "1";

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const start = Date.now();

  try {
    await assert.rejects(
      runPrompt("Hello", {
        authPath,
        cliPath: fixturePath,
        timeout: 30_000,
        signal: controller.signal
      })
    );
    const elapsed = Date.now() - start;
    assert(elapsed < 4000, `escalation should complete within grace, got ${elapsed}ms`);
  } finally {
    if (previousHang == null) {
      delete process.env.FAKE_CODEX_HANG;
    } else {
      process.env.FAKE_CODEX_HANG = previousHang;
    }
    if (previousIgnore == null) {
      delete process.env.FAKE_CODEX_IGNORE_SIGTERM;
    } else {
      process.env.FAKE_CODEX_IGNORE_SIGTERM = previousIgnore;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runPrompt forwards web search and ignore flags to codex exec", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-forward-"));
  const authPath = path.join(tempDir, "auth.json");
  const capturePath = path.join(tempDir, "capture.json");
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

  const previousCapturePath = process.env.FAKE_CODEX_CAPTURE_FILE;
  process.env.FAKE_CODEX_CAPTURE_FILE = capturePath;

  try {
    const response = await runPrompt("Hello", {
      authPath,
      cliPath,
      timeout: 5000,
      webSearch: "live",
      ignoreRules: true,
      ignoreUserConfig: true
    });
    const capture = JSON.parse(fs.readFileSync(capturePath, "utf8")) as {
      args: string[];
      codexHome: string | null;
    };

    assert.equal(response.content, "FAKE:Hello");
    assert.ok(capture.args.includes("--ignore-rules"));
    assert.ok(capture.args.includes("--ignore-user-config"));
    assert.ok(capture.args.some(arg => arg.includes("web_search") && arg.includes("live")));
    assert.ok(capture.codexHome);
  } finally {
    if (previousCapturePath == null) {
      delete process.env.FAKE_CODEX_CAPTURE_FILE;
    } else {
      process.env.FAKE_CODEX_CAPTURE_FILE = previousCapturePath;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
