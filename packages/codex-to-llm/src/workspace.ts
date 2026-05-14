import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function resolveDefaultAuthPath(): string {
  const home = os.homedir();
  if (!home) {
    throw new Error("Unable to resolve the user home directory");
  }

  return path.join(home, ".codex", "auth.json");
}

export function resolveAuthPath(explicitPath?: string): string {
  return explicitPath || process.env.CODEX_TO_LLM_AUTH_PATH || resolveDefaultAuthPath();
}

export function prepareAuthCopy(options: {
  authPath?: string;
  targetPath?: string;
  targetDir?: string;
} = {}): string {
  const authPath = resolveAuthPath(options.authPath);
  if (!fs.existsSync(authPath)) {
    throw new Error(`Codex auth not found at ${authPath}`);
  }

  const explicitTargetPath = options.targetPath;
  const targetDir = explicitTargetPath
    ? path.dirname(explicitTargetPath)
    : options.targetDir || process.env.CODEX_TO_LLM_LOCAL_HOME || path.join(process.cwd(), ".codex-to-llm");
  fs.mkdirSync(targetDir, { recursive: true });

  const targetAuth = explicitTargetPath || path.join(targetDir, "auth.json");
  fs.copyFileSync(authPath, targetAuth);
  return targetAuth;
}

export function createCodexHome(options: { authPath?: string; configHome?: string } = {}): string {
  const authPath = resolveAuthPath(options.authPath);
  if (!fs.existsSync(authPath)) {
    throw new Error(`Codex auth not found at ${authPath}`);
  }

  const rootDir = options.configHome || fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-home-"));
  fs.mkdirSync(rootDir, { recursive: true });

  const targetAuth = path.join(rootDir, "auth.json");
  fs.copyFileSync(authPath, targetAuth);

  const config = [
    'web_search = "disabled"',
    "[mcp_servers]",
    "[features]",
    "shell_snapshot = false",
    "unified_exec = false",
    "multi_agent = false",
    "apps = false",
    "js_repl = false",
    "prevent_idle_sleep = false"
  ].join("\n");
  fs.writeFileSync(path.join(rootDir, "config.toml"), `${config}\n`, "utf8");

  return rootDir;
}

export function createWorkspace(workspacePath?: string): string {
  if (!workspacePath) {
    return fs.mkdtempSync(path.join(os.tmpdir(), "codex-to-llm-workspace-"));
  }

  fs.mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

export function cleanupDirectory(directoryPath: string | undefined, shouldCleanup: boolean): void {
  if (!shouldCleanup || !directoryPath) {
    return;
  }

  try {
    fs.rmSync(directoryPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50
    });
  } catch (error) {
    if (!isIgnorableCleanupError(error)) {
      throw error;
    }
  }
}

function isIgnorableCleanupError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  const code = String(error.code);
  return code === "EBUSY" || code === "ENOTEMPTY" || code === "EPERM";
}
