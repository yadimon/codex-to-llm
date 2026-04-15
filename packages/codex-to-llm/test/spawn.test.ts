import test from "node:test";
import assert from "node:assert/strict";
import { resolveSpawnForPlatform } from "../src/index.js";

test("resolveSpawnForPlatform uses cmd wrapper on Windows for bare commands", () => {
  const resolved = resolveSpawnForPlatform("codex", ["exec", "--model", "gpt 5"], "win32");

  assert.equal(resolved.command, "cmd.exe");
  assert.deepEqual(resolved.args, ["/d", "/s", "/c", "codex exec --model \"gpt 5\""]);
});

test("resolveSpawnForPlatform uses cmd wrapper on Windows for .cmd shims", () => {
  const resolved = resolveSpawnForPlatform(
    "C:\\Program Files\\Codex\\codex.cmd",
    ["exec", "--json"],
    "win32"
  );

  assert.equal(resolved.command, "cmd.exe");
  assert.deepEqual(resolved.args, ["/d", "/s", "/c", "\"C:\\Program Files\\Codex\\codex.cmd\" exec --json"]);
});

test("resolveSpawnForPlatform executes directly on non-Windows platforms", () => {
  const resolved = resolveSpawnForPlatform("/usr/local/bin/codex", ["exec", "--json"], "linux");

  assert.equal(resolved.command, "/usr/local/bin/codex");
  assert.deepEqual(resolved.args, ["exec", "--json"]);
});
