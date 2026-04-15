import fs from "node:fs";
import path from "node:path";
export function isExplicitCliPath(cliPath) {
    return cliPath.includes("/") || cliPath.includes("\\") || path.isAbsolute(cliPath);
}
export function explicitCliCandidates(cliPath, platform = process.platform) {
    if (platform !== "win32" || path.extname(cliPath)) {
        return [cliPath];
    }
    return [cliPath, `${cliPath}.cmd`, `${cliPath}.bat`, `${cliPath}.exe`];
}
export function assertCliPathExists(cliPath, platform = process.platform) {
    if (!isExplicitCliPath(cliPath)) {
        return;
    }
    const hasMatch = explicitCliCandidates(cliPath, platform).some(candidate => fs.existsSync(candidate));
    if (!hasMatch) {
        throw new Error(`Codex CLI not found at ${cliPath}. Install the Codex CLI or pass --cli / CODEX_TO_LLM_CLI_PATH.`);
    }
}
export function normalizeSpawnError(error, cliPath) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        return new Error(`Codex CLI not found at ${cliPath}. Install the Codex CLI or pass --cli / CODEX_TO_LLM_CLI_PATH.`);
    }
    if (error instanceof Error) {
        return error;
    }
    return new Error(String(error));
}
//# sourceMappingURL=platform.js.map