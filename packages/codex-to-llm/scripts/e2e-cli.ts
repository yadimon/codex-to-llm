import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = process.cwd();
const fakeCodexPath =
  process.platform === "win32"
    ? path.join(packageRoot, "test", "fixtures", "fake-codex.cmd")
    : path.join(packageRoot, "test", "fixtures", "fake-codex.mjs");

if (process.platform !== "win32") {
  fs.chmodSync(fakeCodexPath, 0o755);
}

function makeTempFile(name: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-e2e-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return { dir, file };
}

function makeTempAuth() {
  return makeTempFile("auth.json", "{\"token\":\"test\"}\n");
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
  const { dir: authDir, file: authFile } = makeTempAuth();
  const { dir, file } = makeTempFile(
    "prompt.txt",
    "Hello from file"
  );

  try {
    const result = runCli(["--input-file", file, "--json", "--cli", fakeCodexPath], {
      env: {
        CODEX_TO_LLM_AUTH_PATH: authFile
      }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.prompt, "Hello from file");
    assert.equal(parsed.content, "FAKE:Hello from file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(authDir, { recursive: true, force: true });
  }
}

{
  const { dir: authDir, file: authFile } = makeTempAuth();
  const result = runCli(["--stream", "--json", "--cli", fakeCodexPath], {
    env: {
      CODEX_TO_LLM_AUTH_PATH: authFile
    },
    input: "Hello from stdin"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const events = result.stdout
    .trim()
    .split(/\r?\n/)
    .map(line => JSON.parse(line));

  assert.equal(events[0].type, "response.started");
  assert.equal(events.some(event => event.type === "response.output_text.delta"), true);
  assert.equal(events.at(-1).type, "response.completed");

  fs.rmSync(authDir, { recursive: true, force: true });
}

console.log("codex-to-llm CLI e2e passed");
