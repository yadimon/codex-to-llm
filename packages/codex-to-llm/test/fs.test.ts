import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  cleanupDirectory,
  createCodexHome,
  prepareAuthCopy,
  runResponse
} from "../src/index.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-test-"));
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

  assert.equal(createdHome, configHome);
  assert.equal(fs.readFileSync(path.join(configHome, "auth.json"), "utf8"), "{\"token\":\"x\"}\n");
  assert.match(fs.readFileSync(path.join(configHome, "config.toml"), "utf8"), /web_search = "disabled"/);

  cleanupDirectory(sourceDir, true);
  cleanupDirectory(configHome, true);
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

test("runResponse reports a helpful error when the codex CLI is missing", async () => {
  const sourceDir = makeTempDir();
  const workspace = makeTempDir();
  const configHome = makeTempDir();
  const sourceAuth = path.join(sourceDir, "auth.json");

  fs.writeFileSync(sourceAuth, "{\"token\":\"x\"}\n", "utf8");

  await assert.rejects(
    runResponse(
      {
        messages: [
          {
            role: "user",
            content: "Hi"
          }
        ]
      },
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
