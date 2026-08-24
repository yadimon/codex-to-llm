import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  preferWindowsExecutable,
  quoteCmdArg,
  resolveSpawnForPlatform
} from "../src/index.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-spawn-"));
}

test("resolveSpawnForPlatform uses cmd wrapper on Windows for bare commands", () => {
  const resolved = resolveSpawnForPlatform("codex", ["exec", "--model", "gpt 5"], "win32");

  assert.equal(resolved.command, "cmd.exe");
  assert.deepEqual(resolved.args, ["/d", "/s", "/c", "\"codex exec --model \"gpt 5\"\""]);
  assert.equal(resolved.windowsVerbatimArguments, true);
});

test("resolveSpawnForPlatform uses cmd wrapper on Windows for .cmd shims", () => {
  const resolved = resolveSpawnForPlatform(
    "C:\\Program Files\\Codex\\codex.cmd",
    ["exec", "--json"],
    "win32"
  );

  assert.equal(resolved.command, "cmd.exe");
  assert.deepEqual(resolved.args, [
    "/d",
    "/s",
    "/c",
    "\"\"C:\\Program Files\\Codex\\codex.cmd\" exec --json\""
  ]);
  assert.equal(resolved.windowsVerbatimArguments, true);
});

test("resolveSpawnForPlatform executes directly on non-Windows platforms", () => {
  const resolved = resolveSpawnForPlatform("/usr/local/bin/codex", ["exec", "--json"], "linux");

  assert.equal(resolved.command, "/usr/local/bin/codex");
  assert.deepEqual(resolved.args, ["exec", "--json"]);
  assert.equal(resolved.windowsVerbatimArguments, undefined);
});

test("resolveSpawnForPlatform escapes embedded quotes in -c key=\"value\" args on Windows", () => {
  const resolved = resolveSpawnForPlatform(
    "codex",
    ["-c", 'web_search="live"', "-c", 'model_reasoning_effort="low"'],
    "win32"
  );

  assert.equal(resolved.command, "cmd.exe");
  assert.equal(resolved.args[0], "/d");
  assert.equal(resolved.args[1], "/s");
  assert.equal(resolved.args[2], "/c");
  assert.equal(
    resolved.args[3],
    '"codex -c "web_search=""live""" -c "model_reasoning_effort=""low""""'
  );
});

test("quoteCmdArg quotes whitespace, quotes, empty strings, and cmd metacharacters", () => {
  assert.equal(quoteCmdArg("plain"), "plain");
  assert.equal(quoteCmdArg(""), "\"\"");
  assert.equal(quoteCmdArg("two words"), "\"two words\"");
  assert.equal(quoteCmdArg('he said "hi"'), '"he said ""hi"""');
  assert.equal(quoteCmdArg("a&b"), "\"a&b\"");
  assert.equal(quoteCmdArg("a|b"), "\"a|b\"");
  assert.equal(quoteCmdArg("a<b>c"), "\"a<b>c\"");
  assert.equal(quoteCmdArg("a^b"), "\"a^b\"");
  assert.equal(quoteCmdArg("a(b)c"), "\"a(b)c\"");
});

test("resolveSpawnForPlatform rejects cmd expansion characters and newlines", () => {
  for (const unsafe of ["line one\nline two", "100%ready", "value!delayed!"]) {
    assert.throws(
      () => resolveSpawnForPlatform("codex", ["--image", unsafe], "win32"),
      /cannot be passed through.*CODEX_TO_LLM_CLI_PATH/s
    );
  }
});

test("preferWindowsExecutable resolves a bare codex.exe on PATH", () => {
  const binDir = makeTempDir();
  const exePath = path.join(binDir, "codex.exe");
  try {
    fs.writeFileSync(exePath, "");
    assert.equal(preferWindowsExecutable("codex", "win32", { PATH: binDir }), exePath);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("preferWindowsExecutable keeps PATH precedence ahead of a later exe", () => {
  const shimDir = makeTempDir();
  const exeDir = makeTempDir();
  const shimPath = path.join(shimDir, "codex.cmd");
  try {
    fs.writeFileSync(shimPath, "@echo off\r\n");
    fs.writeFileSync(path.join(exeDir, "codex.exe"), "");
    assert.equal(
      preferWindowsExecutable("codex", "win32", {
        PATH: [shimDir, exeDir].join(path.delimiter)
      }),
      shimPath
    );
  } finally {
    fs.rmSync(shimDir, { recursive: true, force: true });
    fs.rmSync(exeDir, { recursive: true, force: true });
  }
});

test(
  "cmd wrapper round-trips image paths containing metacharacters through a real shim",
  { skip: process.platform !== "win32" },
  () => {
    const tempRoot = makeTempDir();
    const dir = path.join(tempRoot, "dir with & metachar");
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "dump-args.js"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
      const shimPath = path.join(dir, "argv-dump.cmd");
      fs.writeFileSync(shimPath, "@node \"%~dp0dump-args.js\" %*\r\n");
      const cliArgs = ["exec", "--image", path.join(dir, "image&(one).png"), "-"];
      const resolved = resolveSpawnForPlatform(shimPath, cliArgs, "win32");
      const result = spawnSync(resolved.command, resolved.args, {
        windowsVerbatimArguments: resolved.windowsVerbatimArguments,
        encoding: "utf8"
      });

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim()), cliArgs);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
);
