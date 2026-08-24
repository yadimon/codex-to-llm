import * as fs from "node:fs";
import * as path from "node:path";
import type { SpawnResolution } from "./types.js";

export function quoteCmdArg(arg: string): string {
  if (arg.length === 0) {
    return "\"\"";
  }
  if (!/[\s"&|<>^()]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, "\"\"")}"`;
}

export function preferWindowsExecutable(
  cliPath: string,
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (platform !== "win32" || path.extname(cliPath)) {
    return cliPath;
  }

  const isExplicitPath = cliPath.includes("/") || cliPath.includes("\\");
  if (isExplicitPath) {
    return resolveWindowsCliCandidate(cliPath) || cliPath;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = resolveWindowsCliCandidate(path.join(dir, cliPath));
    if (candidate) {
      return candidate;
    }
  }

  return cliPath;
}

function resolveWindowsCliCandidate(basePath: string): string | undefined {
  for (const extension of [".exe", ".cmd", ".bat"]) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveSpawnForPlatform(
  cliPath: string,
  cliArgs: string[],
  platform = process.platform
): SpawnResolution {
  const ext = path.extname(cliPath).toLowerCase();
  const isCmdShim = platform === "win32" && [".cmd", ".bat"].includes(ext);
  const useCmdWrapper = platform === "win32" && (isCmdShim || !ext);
  if (!useCmdWrapper) {
    return { command: cliPath, args: cliArgs };
  }

  if ([cliPath, ...cliArgs].some(part => /[\r\n%!]/.test(part))) {
    throw new Error(
      `Arguments with newlines, percent signs, or exclamation marks cannot be passed through ` +
        `the cmd.exe wrapper required for ${cliPath}. Point cliPath / CODEX_TO_LLM_CLI_PATH ` +
        "at the codex.exe binary instead."
    );
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `"${[cliPath, ...cliArgs].map(quoteCmdArg).join(" ")}"`],
    windowsVerbatimArguments: true
  };
}

export function resolveSpawn(cliPath: string, cliArgs: string[]): SpawnResolution {
  return resolveSpawnForPlatform(preferWindowsExecutable(cliPath), cliArgs, process.platform);
}
