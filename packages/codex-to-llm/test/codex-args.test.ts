import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexArgs, normalizeRunOptions } from "../src/index.js";

test("buildCodexArgs starts with exec and ends with stdin marker", () => {
  const args = buildCodexArgs(normalizeRunOptions(), "/tmp/ws");
  assert.equal(args[0], "exec");
  assert.equal(args[args.length - 1], "-");
});

test("buildCodexArgs always includes hardening flags", () => {
  const args = buildCodexArgs(normalizeRunOptions(), "/tmp/ws");
  for (const flag of ["--ephemeral", "--skip-git-repo-check", "--json"]) {
    assert.ok(args.includes(flag), `expected ${flag} to be present`);
  }
  for (const disabled of ["undo", "shell_tool", "child_agents_md", "apply_patch_freeform", "remote_models"]) {
    assert.ok(args.includes(disabled), `expected --disable ${disabled} to be present`);
  }
});

test("buildCodexArgs only adds --ignore-rules when option is true", () => {
  const without = buildCodexArgs(normalizeRunOptions(), "/tmp/ws");
  assert.ok(!without.includes("--ignore-rules"));

  const withFlag = buildCodexArgs(normalizeRunOptions({ ignoreRules: true }), "/tmp/ws");
  assert.ok(withFlag.includes("--ignore-rules"));
});

test("buildCodexArgs only adds --ignore-user-config when option is true", () => {
  const without = buildCodexArgs(normalizeRunOptions(), "/tmp/ws");
  assert.ok(!without.includes("--ignore-user-config"));

  const withFlag = buildCodexArgs(normalizeRunOptions({ ignoreUserConfig: true }), "/tmp/ws");
  assert.ok(withFlag.includes("--ignore-user-config"));
});

test("buildCodexArgs encodes runtime config as -c key=value pairs", () => {
  const args = buildCodexArgs(
    normalizeRunOptions({ webSearch: "live", reasoningEffort: "medium", maxTokens: 256 }),
    "/tmp/ws"
  );
  assert.ok(args.includes('web_search="live"'));
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.ok(args.includes("model_max_output_tokens=256"));
});

test("buildCodexArgs places workspace after -C", () => {
  const args = buildCodexArgs(normalizeRunOptions(), "/some/workspace");
  const idx = args.indexOf("-C");
  assert.notEqual(idx, -1);
  assert.equal(args[idx + 1], "/some/workspace");
});

test("buildCodexArgs forwards model and sandbox values", () => {
  const args = buildCodexArgs(
    normalizeRunOptions({ model: "gpt-5.3-test", sandbox: "read-only" }),
    "/tmp/ws"
  );
  const modelIdx = args.indexOf("--model");
  assert.equal(args[modelIdx + 1], "gpt-5.3-test");
  const sandboxIdx = args.indexOf("--sandbox");
  assert.equal(args[sandboxIdx + 1], "read-only");
});
