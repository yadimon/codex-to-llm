import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const packageRoot = process.cwd();

async function waitForHealth(url: string, timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become healthy at ${url}`);
}

const child = spawn(process.execPath, ["--import", "tsx/esm", "./src/cli.ts", "--host", "127.0.0.1", "--port", "0"], {
  cwd: packageRoot,
  env: {
    ...process.env,
    CODEX_TO_LLM_SERVER_MOCK_MODE: "1",
    CODEX_TO_LLM_SERVER_MOCK_RESPONSE: "mock e2e response"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";
let listenUrl: string | undefined;
child.stdout.on("data", chunk => {
  stdout += chunk.toString();
  const match = stdout.match(/codex-to-llm-server listening on (http:\/\/\S+)/);
  if (match) {
    listenUrl = match[1];
  }
});
child.stderr.on("data", chunk => {
  stderr += chunk.toString();
});

function waitForListening(timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const fail = (message: string) => {
      cleanup();
      reject(new Error(`${message}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      fail(`Server process exited before becoming ready (code=${code}, signal=${signal})`);
    };

    const interval = setInterval(() => {
      if (listenUrl) {
        cleanup();
        resolve(listenUrl);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        fail("Timed out waiting for server startup message");
      }
    }, 100);

    const cleanup = () => {
      clearInterval(interval);
      child.off("exit", onExit);
    };

    child.on("exit", onExit);
  });
}

try {
  const url = await waitForListening();
  await waitForHealth(url, 30000);

  const models = await fetch(`${url}/v1/models`);
  const modelsJson = (await models.json()) as { data: Array<{ id: string }> };
  assert.equal(modelsJson.data[0].id, "gpt-5.3-codex-spark");

  const response = await fetch(`${url}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      instructions: "Answer briefly.",
      input: [
        {
          role: "user",
          content: "Hello CLI server"
        }
      ]
    })
  });

  assert.equal(response.status, 200);
  const responseJson = (await response.json()) as { output_text: string };
  assert.equal(responseJson.output_text, "mock e2e response");

  const stream = await fetch(`${url}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      stream: true,
      input: "Hello stream"
    })
  });
  const streamText = await stream.text();
  assert.match(streamText, /event: response.created/);
  assert.match(streamText, /mock e2e response/);
} finally {
  if (!child.killed) {
    child.kill("SIGTERM");
  }

  if (child.exitCode == null && child.signalCode == null) {
    await new Promise(resolve => child.once("exit", resolve));
  }
}

assert.match(stdout, /codex-to-llm-server listening on/);
assert.equal(stderr.trim(), "");
console.log("codex-to-llm-server CLI e2e passed");
