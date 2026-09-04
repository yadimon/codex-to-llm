import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  cleanupDirectory,
  createCodexHome,
  prepareAuthCopy,
  resolveCodexHomeBase,
  runPrompt
} from "../src/index.js";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-test-"));
  tempDirs.push(dir);
  return dir;
}

test("prepareAuthCopy copies auth.json to the requested target", () => {
  const sourceDir = makeTempDir();
  const targetDir = makeTempDir();
  const sourceAuth = path.join(sourceDir, "auth.json");
  const targetAuth = path.join(targetDir, "copied-auth.json");

  fs.writeFileSync(sourceAuth, "{\"token\":\"x\"}\n", "utf8");

  const copiedTo = prepareAuthCopy({
    authPath: sourceAuth,
    targetPath: targetAuth
  });

  assert.equal(copiedTo, targetAuth);
  assert.equal(fs.readFileSync(targetAuth, "utf8"), "{\"token\":\"x\"}\n");

  cleanupDirectory(sourceDir, true);
  cleanupDirectory(targetDir, true);
});

test("createCodexHome writes auth and config files", () => {
  const sourceDir = makeTempDir();
  const configHome = makeTempDir();
  const sourceAuth = path.join(sourceDir, "auth.json");

  fs.writeFileSync(sourceAuth, "{\"token\":\"x\"}\n", "utf8");

  const createdHome = createCodexHome({
    authPath: sourceAuth,
    configHome
  });
  const configToml = fs.readFileSync(path.join(configHome, "config.toml"), "utf8");

  assert.equal(createdHome, configHome);
  assert.equal(fs.readFileSync(path.join(configHome, "auth.json"), "utf8"), "{\"token\":\"x\"}\n");
  assert.match(configToml, /web_search = "disabled"/);
  assert.match(configToml, /sqlite_home = ":memory:"/);
  assert.match(configToml, /\[history\]\npersistence = "none"/);
  assert.match(configToml, /plugins = false/);
  assert.doesNotMatch(configToml, /steer = false/);

  cleanupDirectory(sourceDir, true);
  cleanupDirectory(configHome, true);
});

test("createCodexHome creates the auto-home under CODEX_TO_LLM_HOME_BASE", () => {
  const sourceDir = makeTempDir();
  const sourceAuth = path.join(sourceDir, "auth.json");
  const overrideBase = makeTempDir();
  fs.writeFileSync(sourceAuth, "{\"token\":\"x\"}\n", "utf8");

  const previousOverride = process.env.CODEX_TO_LLM_HOME_BASE;
  process.env.CODEX_TO_LLM_HOME_BASE = overrideBase;
  try {
    const createdHome = createCodexHome({ authPath: sourceAuth });
    assert.equal(resolveCodexHomeBase(), overrideBase);
    assert.equal(path.dirname(createdHome), overrideBase);
    assert.equal(fs.readFileSync(path.join(createdHome, "auth.json"), "utf8"), "{\"token\":\"x\"}\n");
    cleanupDirectory(createdHome, true);
  } finally {
    if (previousOverride === undefined) {
      delete process.env.CODEX_TO_LLM_HOME_BASE;
    } else {
      process.env.CODEX_TO_LLM_HOME_BASE = previousOverride;
    }
  }

  cleanupDirectory(sourceDir, true);
  cleanupDirectory(overrideBase, true);
});

test("resolveCodexHomeBase platform default never lives under os.tmpdir", () => {
  const previousOverride = process.env.CODEX_TO_LLM_HOME_BASE;
  delete process.env.CODEX_TO_LLM_HOME_BASE;
  try {
    const base = resolveCodexHomeBase();
    assert.ok(
      !base.toLowerCase().startsWith(os.tmpdir().toLowerCase() + path.sep) &&
      base.toLowerCase() !== os.tmpdir().toLowerCase(),
      `platform-default codex home base ${base} must not sit under os.tmpdir ${os.tmpdir()}`
    );
  } finally {
    if (previousOverride !== undefined) {
      process.env.CODEX_TO_LLM_HOME_BASE = previousOverride;
    }
  }
});

test("resolveCodexHomeBase honours CODEX_TO_LLM_HOME_BASE then platform defaults", () => {
  const previousOverride = process.env.CODEX_TO_LLM_HOME_BASE;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousXdg = process.env.XDG_DATA_HOME;
  try {
    process.env.CODEX_TO_LLM_HOME_BASE = "C:/nope/override";
    assert.equal(resolveCodexHomeBase(), "C:/nope/override");

    delete process.env.CODEX_TO_LLM_HOME_BASE;
    if (process.platform === "win32") {
      process.env.LOCALAPPDATA = "C:/fake-local";
      assert.equal(resolveCodexHomeBase(), path.join("C:/fake-local", "codex-to-llm", "homes"));
    } else {
      process.env.XDG_DATA_HOME = "/fake-xdg";
      assert.equal(resolveCodexHomeBase(), path.join("/fake-xdg", "codex-to-llm", "homes"));
    }
  } finally {
    if (previousOverride === undefined) { delete process.env.CODEX_TO_LLM_HOME_BASE; } else { process.env.CODEX_TO_LLM_HOME_BASE = previousOverride; }
    if (previousLocalAppData === undefined) { delete process.env.LOCALAPPDATA; } else { process.env.LOCALAPPDATA = previousLocalAppData; }
    if (previousXdg === undefined) { delete process.env.XDG_DATA_HOME; } else { process.env.XDG_DATA_HOME = previousXdg; }
  }
});

test("cleanupDirectory removes owned temp directories and ignores disabled cleanup", () => {
  const keepDir = makeTempDir();
  const deleteDir = makeTempDir();

  cleanupDirectory(keepDir, false);
  cleanupDirectory(deleteDir, true);

  assert.equal(fs.existsSync(keepDir), true);
  assert.equal(fs.existsSync(deleteDir), false);

  cleanupDirectory(keepDir, true);
});

test("runPrompt reports a helpful error when the codex CLI is missing", async () => {
  const sourceDir = makeTempDir();
  const workspace = makeTempDir();
  const configHome = makeTempDir();
  const sourceAuth = path.join(sourceDir, "auth.json");

  fs.writeFileSync(sourceAuth, "{\"token\":\"x\"}\n", "utf8");

  await assert.rejects(
    runPrompt(
      "Hi",
      {
        authPath: sourceAuth,
        cliPath: path.join(sourceDir, "missing-codex"),
        configHome,
        cwd: workspace
      }
    ),
    /Codex CLI not found/
  );

  cleanupDirectory(sourceDir, true);
  cleanupDirectory(workspace, true);
  cleanupDirectory(configHome, true);
});
