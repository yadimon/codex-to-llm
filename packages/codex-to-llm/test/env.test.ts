import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChildEnv, runPrompt } from "../src/index.js";

test("buildChildEnv excludes server secrets by default", () => {
  const previous = process.env.SHOULD_NOT_LEAK;
  process.env.SHOULD_NOT_LEAK = "secret";
  try {
    const env = buildChildEnv({ codexHome: "/tmp/x" });
    assert.equal(env.CODEX_HOME, "/tmp/x");
    assert.equal(env.SHOULD_NOT_LEAK, undefined);
    assert.ok(env.PATH, "PATH should pass through");
  } finally {
    if (previous == null) {
      delete process.env.SHOULD_NOT_LEAK;
    } else {
      process.env.SHOULD_NOT_LEAK = previous;
    }
  }
});

test("buildChildEnv passes proxy and CA env vars", () => {
  const previousProxy = process.env.HTTPS_PROXY;
  const previousCa = process.env.NODE_EXTRA_CA_CERTS;
  process.env.HTTPS_PROXY = "http://proxy.example:3128";
  process.env.NODE_EXTRA_CA_CERTS = "/etc/ssl/extra.pem";
  try {
    const env = buildChildEnv({ codexHome: "/tmp/x" });
    assert.equal(env.HTTPS_PROXY, "http://proxy.example:3128");
    assert.equal(env.NODE_EXTRA_CA_CERTS, "/etc/ssl/extra.pem");
  } finally {
    if (previousProxy == null) {
      delete process.env.HTTPS_PROXY;
    } else {
      process.env.HTTPS_PROXY = previousProxy;
    }
    if (previousCa == null) {
      delete process.env.NODE_EXTRA_CA_CERTS;
    } else {
      process.env.NODE_EXTRA_CA_CERTS = previousCa;
    }
  }
});

test("buildChildEnv honors envPassthrough option", () => {
  const previous = process.env.MY_CUSTOM;
  process.env.MY_CUSTOM = "yes";
  try {
    const env = buildChildEnv({ codexHome: "/tmp/x", envPassthrough: ["MY_CUSTOM"] });
    assert.equal(env.MY_CUSTOM, "yes");
  } finally {
    if (previous == null) {
      delete process.env.MY_CUSTOM;
    } else {
      process.env.MY_CUSTOM = previous;
    }
  }
});

test("buildChildEnv reads CODEX_TO_LLM_ENV_PASSTHROUGH csv", () => {
  const previousList = process.env.CODEX_TO_LLM_ENV_PASSTHROUGH;
  const previousFoo = process.env.FOO_VAR;
  const previousBar = process.env.BAR_VAR;
  process.env.CODEX_TO_LLM_ENV_PASSTHROUGH = "FOO_VAR, BAR_VAR";
  process.env.FOO_VAR = "foo";
  process.env.BAR_VAR = "bar";
  try {
    const env = buildChildEnv({ codexHome: "/tmp/x" });
    assert.equal(env.FOO_VAR, "foo");
    assert.equal(env.BAR_VAR, "bar");
  } finally {
    if (previousList == null) {
      delete process.env.CODEX_TO_LLM_ENV_PASSTHROUGH;
    } else {
      process.env.CODEX_TO_LLM_ENV_PASSTHROUGH = previousList;
    }
    if (previousFoo == null) {
      delete process.env.FOO_VAR;
    } else {
      process.env.FOO_VAR = previousFoo;
    }
    if (previousBar == null) {
      delete process.env.BAR_VAR;
    } else {
      process.env.BAR_VAR = previousBar;
    }
  }
});

test("buildChildEnv rejects malformed env names", () => {
  assert.throws(
    () => buildChildEnv({ codexHome: "/tmp/x", envPassthrough: ["BAD VAR"] }),
    /Invalid env passthrough name/
  );
  assert.throws(
    () => buildChildEnv({ codexHome: "/tmp/x", envPassthrough: ["1BAD"] }),
    /Invalid env passthrough name/
  );
});

test("runPrompt does not leak undeclared env vars to the subprocess", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-envleak-"));
  const authPath = path.join(tempDir, "auth.json");
  const dumpPath = path.join(tempDir, "env-dump.json");
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

  const previousLeak = process.env.SECRET_SHOULD_NOT_LEAK;
  const previousDump = process.env.FAKE_CODEX_DUMP_ENV;
  const previousCustom = process.env.MY_OPTIN;
  process.env.SECRET_SHOULD_NOT_LEAK = "leaked";
  process.env.FAKE_CODEX_DUMP_ENV = dumpPath;
  process.env.MY_OPTIN = "yes";

  try {
    await runPrompt("Hello", {
      authPath,
      cliPath,
      timeout: 5000,
      envPassthrough: ["MY_OPTIN", "FAKE_CODEX_DUMP_ENV"]
    });
    const dumped = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as Record<string, string>;
    assert.equal(dumped.SECRET_SHOULD_NOT_LEAK, undefined);
    assert.equal(dumped.MY_OPTIN, "yes");
    assert.ok(dumped.CODEX_HOME, "child must see CODEX_HOME");
    assert.ok(dumped.PATH, "child must see PATH");
  } finally {
    if (previousLeak == null) {
      delete process.env.SECRET_SHOULD_NOT_LEAK;
    } else {
      process.env.SECRET_SHOULD_NOT_LEAK = previousLeak;
    }
    if (previousDump == null) {
      delete process.env.FAKE_CODEX_DUMP_ENV;
    } else {
      process.env.FAKE_CODEX_DUMP_ENV = previousDump;
    }
    if (previousCustom == null) {
      delete process.env.MY_OPTIN;
    } else {
      process.env.MY_OPTIN = previousCustom;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
