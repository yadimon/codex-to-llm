import * as fs from "node:fs";
import * as path from "node:path";

export function isExplicitCliPath(cliPath: string): boolean {
  return cliPath.includes("/") || cliPath.includes("\\") || path.isAbsolute(cliPath);
}

export function explicitCliCandidates(cliPath: string, platform = process.platform): string[] {
  if (platform !== "win32" || path.extname(cliPath)) {
    return [cliPath];
  }

  return [cliPath, `${cliPath}.cmd`, `${cliPath}.bat`, `${cliPath}.exe`];
}

export function assertCliPathExists(cliPath: string, platform = process.platform): void {
  if (!isExplicitCliPath(cliPath)) {
    return;
  }

  const hasMatch = explicitCliCandidates(cliPath, platform).some(candidate => fs.existsSync(candidate));
  if (!hasMatch) {
    throw new Error(
      `Codex CLI not found at ${cliPath}. Install the Codex CLI or pass --cli / CODEX_TO_LLM_CLI_PATH.`
    );
  }
}

export function normalizeSpawnError(error: unknown, cliPath: string): Error {
  if (typeof error === "object" && error && "code" in error) {
    switch (error.code) {
      case "ENOENT":
        return new Error(
          `Codex CLI not found at ${cliPath}. Install the Codex CLI or pass --cli / CODEX_TO_LLM_CLI_PATH.`
        );
      case "EACCES":
      case "EPERM":
        return new Error(`Codex CLI at ${cliPath} is not executable. Check file permissions.`);
      case "EISDIR":
      case "ENOTDIR":
        return new Error(`Codex CLI path ${cliPath} is invalid. Check that it points to an executable.`);
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
