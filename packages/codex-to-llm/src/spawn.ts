import * as path from "node:path";
import type { SpawnResolution } from "./types.js";

export function quoteCmdArg(arg: string): string {
  if (arg.length === 0) {
    return "\"\"";
  }
  if (!/[\s"]/g.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, "\"\"")}"`;
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

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [cliPath, ...cliArgs].map(quoteCmdArg).join(" ")]
  };
}

export function resolveSpawn(cliPath: string, cliArgs: string[]): SpawnResolution {
  return resolveSpawnForPlatform(cliPath, cliArgs, process.platform);
}
