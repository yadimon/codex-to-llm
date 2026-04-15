import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = process.cwd();
const fakeCodexPath =
  process.platform === "win32"
    ? path.join(packageRoot, "test", "fixtures", "fake-codex.cmd")
    : path.join(packageRoot, "test", "fixtures", "fake-codex.mjs");

function makeTempFile(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-e2e-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return { dir, file };
}

function runCli(args: string[], options: { env?: NodeJS.ProcessEnv; input?: string } = {}) {
  return spawnSync(process.execPath, ["--import", "tsx/esm", "./src/cli.ts", ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env
    },
    input: options.input
  });
}

{
  const { dir, file } = makeTempFile(
    "chat.json",
    JSON.stringify(
      {
        instructions: "Answer briefly.",
        input: [{ role: "user", content: "Hello from file" }]
      },
      null,
      2
    )
  );

  try {
    const result = runCli(["--input-file", file, "--json", "--cli", fakeCodexPath]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.match(parsed.content, /FAKE:/);
    assert.match(parsed.content, /Hello from file/);
    assert.equal(parsed.messages[0].content, "Hello from file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  const result = runCli(["--stdin-json", "--stream", "--json", "--cli", fakeCodexPath], {
    input: JSON.stringify({
      input: [{ role: "user", content: "Hello from stdin" }]
    })
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const events = result.stdout
    .trim()
    .split(/\r?\n/)
    .map(line => JSON.parse(line));

  assert.equal(events[0].type, "response.started");
  assert.equal(events.some(event => event.type === "response.output_text.delta"), true);
  assert.equal(events.at(-1).type, "response.completed");
}

console.log("codex-to-llm CLI e2e passed");
