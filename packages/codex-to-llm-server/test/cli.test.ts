import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { HELP_TEXT } from "../src/cli.js";

test("CLI help documents host and auth flags", () => {
  assert.match(HELP_TEXT, /codex-to-llm-server/);
  assert.match(HELP_TEXT, /--host <host>/);
  assert.match(HELP_TEXT, /--api-key <value>/);
  assert.match(HELP_TEXT, /--search/);
  assert.match(HELP_TEXT, /--web-search <disabled\|cached\|live>/);
  assert.match(HELP_TEXT, /--ignore-rules/);
  assert.match(HELP_TEXT, /--ignore-user-config/);
});

test("CLI exits with code 1 for an invalid port", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "./src/cli.ts", "--port", "99999"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --port/);
});
