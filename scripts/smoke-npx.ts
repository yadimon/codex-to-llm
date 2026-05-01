import { execFileSync, spawn } from "node:child_process";
import * as net from "node:net";

const VERSION = process.env.SMOKE_PUBLISHED_VERSION || "1.0.0";
const PROMPT = process.env.SMOKE_PUBLISHED_PROMPT || "Reply with the single word OK and nothing else.";
const MODEL = process.env.SMOKE_PUBLISHED_MODEL || "gpt-5.3-codex-spark";
const TIMEOUT_MS = Number(process.env.SMOKE_PUBLISHED_TIMEOUT_MS || 180_000);

function runNpx(args: string[], stdinPayload?: string): { stdout: string; stderr: string } {
  const cmd = process.platform === "win32" ? "cmd.exe" : "npx";
  const cmdArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", `npx ${args.join(" ")}`] : args;

  const result = execFileSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: stdinPayload ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: stdinPayload,
    maxBuffer: 16 * 1024 * 1024
  });
  return { stdout: result, stderr: "" };
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitForHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`server did not become healthy at ${url} within ${timeoutMs}ms`);
}

async function smokeCoreCli(): Promise<void> {
  console.log(`[smoke] core: npx -y @yadimon/codex-to-llm@${VERSION} --prompt ... --max-tokens 32`);
  const start = Date.now();
  const { stdout } = runNpx([
    "-y",
    `@yadimon/codex-to-llm@${VERSION}`,
    "--prompt",
    JSON.stringify(PROMPT),
    "--model",
    MODEL,
    "--max-tokens",
    "32"
  ]);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("empty stdout from core CLI");
  }
  console.log(`[smoke] core OK in ${Date.now() - start}ms; stdout: ${JSON.stringify(trimmed)}`);
}

async function smokeServerCli(): Promise<void> {
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  console.log(`[smoke] server: npx -y @yadimon/codex-to-llm-server@${VERSION} --port ${port}`);

  const isWin = process.platform === "win32";
  const child = spawn(
    isWin ? "cmd.exe" : "npx",
    isWin
      ? [
          "/d",
          "/s",
          "/c",
          `npx -y @yadimon/codex-to-llm-server@${VERSION} --host 127.0.0.1 --port ${port} --model ${MODEL}`
        ]
      : [
          "-y",
          `@yadimon/codex-to-llm-server@${VERSION}`,
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--model",
          MODEL
        ],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );

  const stderrChunks: string[] = [];
  child.stderr.on("data", chunk => stderrChunks.push(chunk.toString()));
  child.stdout.on("data", () => {
    // discard server log lines; we only need health/HTTP responses
  });

  try {
    await waitForHealth(url, 90_000);
    console.log(`[smoke] server up at ${url}`);

    const start = Date.now();
    const response = await fetch(`${url}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: PROMPT })
    });
    if (response.status !== 200) {
      throw new Error(`/v1/responses status ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as { output_text: string };
    if (!json.output_text || !json.output_text.trim()) {
      throw new Error("empty output_text");
    }
    console.log(`[smoke] server OK in ${Date.now() - start}ms; output: ${JSON.stringify(json.output_text)}`);
  } finally {
    if (!child.killed) {
      child.kill();
    }
    if (stderrChunks.length > 0) {
      const stderr = stderrChunks.join("");
      if (stderr.trim()) {
        console.log("[smoke] server stderr (tail):", stderr.slice(-500));
      }
    }
  }
}

async function main(): Promise<void> {
  const overall = setTimeout(() => {
    console.error("[smoke] global timeout");
    process.exit(1);
  }, TIMEOUT_MS);
  overall.unref();

  await smokeCoreCli();
  await smokeServerCli();
  console.log("[smoke] all npx checks passed");
  clearTimeout(overall);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[smoke] FAILED:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
