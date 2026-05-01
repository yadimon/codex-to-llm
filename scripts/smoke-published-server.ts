import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "@yadimon/codex-to-llm-server";
const VERSION_SPEC = process.env.SMOKE_PUBLISHED_VERSION || "latest";
const PROMPT = process.env.SMOKE_PUBLISHED_PROMPT || "Reply with the single word OK and nothing else.";
const MODEL = process.env.SMOKE_PUBLISHED_MODEL || "gpt-5.3-codex-spark";

interface StartedServer {
  url: string;
  close(): Promise<void>;
}

function runNpm(args: string[], cwd: string): string {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd,
      encoding: "utf8",
      stdio: "pipe"
    });
  }
  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-published-server-"));
  console.log(`[smoke] tmp: ${tmpDir}`);

  let started: StartedServer | undefined;

  try {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "smoke-published-server", private: true, type: "module" }, null, 2)
    );

    console.log(`[smoke] installing ${PACKAGE_NAME}@${VERSION_SPEC}...`);
    runNpm(["install", "--no-audit", "--no-fund", `${PACKAGE_NAME}@${VERSION_SPEC}`], tmpDir);

    const installedPkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "node_modules", "@yadimon", "codex-to-llm-server", "package.json"),
        "utf8"
      )
    ) as { version: string; dependencies?: Record<string, string> };
    console.log(
      `[smoke] installed ${PACKAGE_NAME}@${installedPkg.version} ` +
        `(core dep: ${installedPkg.dependencies?.["@yadimon/codex-to-llm"]})`
    );

    const corePkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "node_modules", "@yadimon", "codex-to-llm", "package.json"),
        "utf8"
      )
    ) as { version: string };
    console.log(`[smoke] resolved core: @yadimon/codex-to-llm@${corePkg.version}`);

    const entryPath = path.join(
      tmpDir,
      "node_modules",
      "@yadimon",
      "codex-to-llm-server",
      "dist",
      "index.js"
    );
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entrypoint missing in installed package: ${entryPath}`);
    }

    const entry = await import(pathToFileURL(entryPath).href) as {
      startServer: (options: Record<string, unknown>) => Promise<StartedServer>;
    };

    started = await entry.startServer({
      host: "127.0.0.1",
      port: 0,
      models: [MODEL],
      defaultModel: MODEL
    });
    console.log(`[smoke] server up at ${started.url}`);

    const health = await fetch(`${started.url}/healthz`);
    if (!health.ok) {
      throw new Error(`/healthz status ${health.status}`);
    }

    const models = await fetch(`${started.url}/v1/models`);
    const modelsJson = (await models.json()) as { data?: Array<{ id: string }> };
    if (!modelsJson.data?.some(m => m.id === MODEL)) {
      throw new Error(`/v1/models did not list ${MODEL}: ${JSON.stringify(modelsJson)}`);
    }

    console.log(`[smoke] sync /v1/responses model=${MODEL}`);
    const start = Date.now();
    const response = await fetch(`${started.url}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: PROMPT })
    });
    if (response.status !== 200) {
      throw new Error(`/v1/responses status ${response.status}: ${await response.text()}`);
    }
    const responseJson = (await response.json()) as {
      output_text: string;
      usage: { input_tokens: number; output_tokens: number; total_tokens: number };
    };
    const elapsed = Date.now() - start;

    if (!responseJson.output_text || !responseJson.output_text.trim()) {
      throw new Error("Empty output_text from server");
    }

    console.log(`[smoke] OK in ${elapsed}ms`);
    console.log(`[smoke] output: ${JSON.stringify(responseJson.output_text)}`);
    console.log(
      `[smoke] usage: input=${responseJson.usage.input_tokens} ` +
        `output=${responseJson.usage.output_tokens} total=${responseJson.usage.total_tokens}`
    );
  } finally {
    if (started) {
      await started.close().catch(() => {});
    }
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  console.error("[smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
