import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const packageRoot = process.cwd();
const npmCache = path.join(packageRoot, ".npm-cache");
fs.mkdirSync(npmCache, { recursive: true });
const sharedEnv = {
  ...process.env,
  npm_config_cache: npmCache
};

function runNpm(args: string[], cwd = packageRoot): string {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd,
      env: sharedEnv,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8"
    });
  }

  return execFileSync("npm", args, {
    cwd,
    env: sharedEnv,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8"
  });
}

function main(): void {
  runNpm(["run", "build"]);
  if (!fs.existsSync(path.join(packageRoot, "dist", "index.js"))) {
    throw new Error("Build output missing: dist/index.js");
  }

  runNpm(["pack", "--dry-run", "--ignore-scripts"], packageRoot);

  const packFile = runNpm(["pack", "--ignore-scripts"], packageRoot).trim().split(/\r?\n/).at(-1);
  if (!packFile) {
    throw new Error("npm pack did not return a tarball name");
  }

  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-consumer-"));

  try {
    fs.writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }, null, 2)
    );
    runNpm(["install", path.join(packageRoot, packFile)], consumerDir);
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'const mod = await import("@yadimon/codex-to-llm"); if (typeof mod.runPrompt !== "function") throw new Error("missing runPrompt");'
      ],
      {
        cwd: consumerDir,
        env: sharedEnv,
        stdio: "inherit"
      }
    );
  } finally {
    fs.rmSync(path.join(packageRoot, packFile), { force: true });
    fs.rmSync(consumerDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
