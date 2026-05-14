import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "@yadimon/codex-to-llm";
const VERSION_SPEC = process.env.SMOKE_PUBLISHED_VERSION || "latest";
const PROMPT = process.env.SMOKE_PUBLISHED_PROMPT || "Reply with the single word OK and nothing else.";
const MODEL = process.env.SMOKE_PUBLISHED_MODEL || "gpt-5.3-codex-spark";
const TIMEOUT_MS = Number(process.env.SMOKE_PUBLISHED_TIMEOUT_MS || 120_000);

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-published-core-"));
  console.log(`[smoke] tmp: ${tmpDir}`);

  try {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "smoke-published-core", private: true, type: "module" }, null, 2)
    );

    console.log(`[smoke] installing ${PACKAGE_NAME}@${VERSION_SPEC}...`);
    runNpm(["install", "--no-audit", "--no-fund", `${PACKAGE_NAME}@${VERSION_SPEC}`], tmpDir);

    const installedPkg = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "node_modules", "@yadimon", "codex-to-llm", "package.json"),
        "utf8"
      )
    ) as { version: string };
    console.log(`[smoke] installed @yadimon/codex-to-llm@${installedPkg.version}`);

    const entryPath = path.join(
      tmpDir,
      "node_modules",
      "@yadimon",
      "codex-to-llm",
      "dist",
      "index.js"
    );
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entrypoint missing in installed package: ${entryPath}`);
    }

    const entry = await import(pathToFileURL(entryPath).href) as {
      runPrompt: (prompt: string, options: Record<string, unknown>) => Promise<{
        content: string;
        usage: { inputTokens: number; outputTokens: number; totalTokens: number };
        model: string;
      }>;
    };

    console.log(`[smoke] runPrompt model=${MODEL} timeout=${TIMEOUT_MS}ms`);
    const start = Date.now();
    const result = await entry.runPrompt(PROMPT, {
      model: MODEL,
      reasoningEffort: "low",
      maxTokens: 32,
      timeout: TIMEOUT_MS
    });
    const elapsed = Date.now() - start;

    if (!result.content || !result.content.trim()) {
      throw new Error("Empty response from runPrompt");
    }

    console.log(`[smoke] OK in ${elapsed}ms`);
    console.log(`[smoke] model: ${result.model}`);
    console.log(`[smoke] content: ${JSON.stringify(result.content)}`);
    console.log(`[smoke] usage: input=${result.usage.inputTokens} output=${result.usage.outputTokens} total=${result.usage.totalTokens}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => {
  console.error("[smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
