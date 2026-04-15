import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const repoRoot = process.cwd();
export const npmCacheDir = path.join(repoRoot, ".npm-cache");

export function ensureNpmCache(): void {
  fs.mkdirSync(npmCacheDir, { recursive: true });
}

export function runNpm(args: string[], options: { cwd?: string } = {}): void {
  ensureNpmCache();

  const cwd = options.cwd || repoRoot;
  const env = {
    ...process.env,
    npm_config_cache: npmCacheDir
  };

  if (process.platform === "win32") {
    const command = `npm ${args.map(quoteForCmd).join(" ")}`;
    execFileSync("cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      env,
      stdio: "inherit"
    });
    return;
  }

  execFileSync("npm", args, {
    cwd,
    env,
    stdio: "inherit"
  });
}

function quoteForCmd(arg: string): string {
  if (!/[\s"]/g.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/g, "\"\"")}"`;
}
