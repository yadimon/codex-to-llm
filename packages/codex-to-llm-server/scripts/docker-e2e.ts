import { execFileSync, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, "..", "..");
const imageTag = "codex-to-llm-server:test";
const containerName = `codex-to-llm-server-e2e-${Date.now()}`;

function runDocker(args: string[], options: Parameters<typeof execFileSync>[2] = {}): string {
  return execFileSync("docker", args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    ...options
  }) as string;
}

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

async function waitFor(url: string, timeoutMs = 30000): Promise<void> {
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

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  throw new Error(`Docker container did not become healthy at ${url}`);
}

async function main(): Promise<void> {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;

  try {
    runDocker(["build", "-f", "packages/codex-to-llm-server/Dockerfile", "-t", imageTag, "."], {
      stdio: "inherit"
    });

    runDocker(
      [
        "run",
        "--rm",
        "--detach",
        "--name",
        containerName,
        "--publish",
        `${port}:3000`,
        "--env",
        "CODEX_TO_LLM_SERVER_MOCK_MODE=1",
        "--env",
        "CODEX_TO_LLM_SERVER_MOCK_RESPONSE=docker mock response",
        imageTag
      ],
      {
        stdio: "inherit"
      }
    );

    await waitFor(url);

    const models = await fetch(`${url}/v1/models`);
    const modelsJson = (await models.json()) as { data?: Array<{ id: string }> };
    if (models.status !== 200 || modelsJson.data?.[0]?.id !== "gpt-5.3-codex-spark") {
      throw new Error(`Unexpected /v1/models response: ${JSON.stringify(modelsJson)}`);
    }

    const response = await fetch(`${url}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: "Hello from docker"
      })
    });
    const responseJson = (await response.json()) as { output_text?: string };
    if (response.status !== 200 || responseJson.output_text !== "docker mock response") {
      throw new Error(`Unexpected /v1/responses payload: ${JSON.stringify(responseJson)}`);
    }

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
    if (!/event: response.created/.test(streamText) || !/docker mock response/.test(streamText)) {
      throw new Error(`Unexpected streaming response: ${streamText}`);
    }
  } finally {
    spawnSync("docker", ["rm", "-f", containerName], {
      cwd: repoRoot,
      stdio: "ignore"
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
