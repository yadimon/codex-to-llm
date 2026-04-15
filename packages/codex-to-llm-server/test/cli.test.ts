import test from "node:test";
import assert from "node:assert/strict";
import { HELP_TEXT } from "../src/cli.js";

test("CLI help documents host and auth flags", () => {
  assert.match(HELP_TEXT, /codex-to-llm-server/);
  assert.match(HELP_TEXT, /--host <host>/);
  assert.match(HELP_TEXT, /--api-key <value>/);
});
