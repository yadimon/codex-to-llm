import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { HELP_TEXT } from "../src/cli.js";

test("CLI help text documents JSON and streaming options", () => {
  assert.match(HELP_TEXT, /codex-to-llm/);
  assert.match(HELP_TEXT, /--input-file <path>/);
  assert.match(HELP_TEXT, /--stdin-json/);
  assert.match(HELP_TEXT, /--stream/);
});

test("CLI exits with code 1 and prints an error when input is missing", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx/esm", "./src/cli.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Prompt or JSON input is required/);
});
