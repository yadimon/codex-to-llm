import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

const packageRoot = process.cwd();

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
    server.on("error", reject);
  });
}

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

const port = await getFreePort();
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx/esm", "./src/cli.ts", "--host", "127.0.0.1", "--port", String(port)], {
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
child.stdout.on("data", chunk => {
  stdout += chunk.toString();
});
child.stderr.on("data", chunk => {
  stderr += chunk.toString();
});

try {
  await waitForHealth(url);

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
  child.kill("SIGTERM");
  await new Promise(resolve => child.once("exit", resolve));
}

assert.match(stdout, /codex-to-llm-server listening on/);
assert.equal(stderr.trim(), "");
console.log("codex-to-llm-server CLI e2e passed");
