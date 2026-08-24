import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { HELP_TEXT, normalizeCliImage } from "../src/cli.js";
import { createCliArgReader } from "../src/index.js";

const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC";

test("CLI help text documents JSON and streaming options", () => {
  assert.match(HELP_TEXT, /codex-to-llm/);
  assert.match(HELP_TEXT, /--input-file <path>/);
  assert.match(HELP_TEXT, /--image <path\|url\|data-url>/);
  assert.match(HELP_TEXT, /--stream/);
  assert.match(HELP_TEXT, /--verbose/);
  assert.match(HELP_TEXT, /--search/);
  assert.match(HELP_TEXT, /--web-search <disabled\|cached\|live>/);
  assert.match(HELP_TEXT, /--ignore-rules/);
  assert.match(HELP_TEXT, /--ignore-user-config/);
  assert.match(HELP_TEXT, /--direct-api-call/);
  assert.match(HELP_TEXT, /--confirm-direct-api-risk/);
  assert.match(HELP_TEXT, /--instructions <text>/);
});

test("CLI parses repeated local, URL, and data image inputs", () => {
  const reader = createCliArgReader([
    "--image",
    "one.png",
    "--image",
    "https://example.com/two.jpg"
  ]);
  assert.deepEqual(reader.getArgs("--image"), ["one.png", "https://example.com/two.jpg"]);
  assert.deepEqual(normalizeCliImage("one.png"), { type: "file", path: "one.png" });
  assert.deepEqual(normalizeCliImage("https://example.com/two.jpg"), {
    type: "url",
    url: "https://example.com/two.jpg"
  });
  assert.deepEqual(normalizeCliImage(`data:image/png;base64,${RED_PNG_BASE64}`), {
    type: "base64",
    mediaType: "image/png",
    data: RED_PNG_BASE64
  });
});

test("CLI exits with code 1 and prints an error when input is missing", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx/esm", "./src/cli.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Prompt input is required/);
});

test("CLI exits with code 1 for an invalid --web-search value", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "./src/cli.ts", "--prompt", "Hi", "--web-search", "fast"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --web-search/);
});
