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

export function resolveCodexHomeBase(): string {
  const override = process.env.CODEX_TO_LLM_HOME_BASE;
  if (override) {
    return override;
  }

  const home = os.homedir();
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || (home && path.join(home, "AppData", "Local"));
    if (!localAppData) {
      throw new Error("Unable to resolve LOCALAPPDATA for codex_home base");
    }
    return path.join(localAppData, "codex-to-llm", "homes");
  }

  const xdgDataHome = process.env.XDG_DATA_HOME || (home && path.join(home, ".local", "share"));
  if (!xdgDataHome) {
    throw new Error("Unable to resolve XDG_DATA_HOME for codex_home base");
  }
  return path.join(xdgDataHome, "codex-to-llm", "homes");
}

export function createCodexHome(options: { authPath?: string; configHome?: string } = {}): string {
  const authPath = resolveAuthPath(options.authPath);
  if (!fs.existsSync(authPath)) {
    throw new Error(`Codex auth not found at ${authPath}`);
  }

  let rootDir: string;
  if (options.configHome) {
    rootDir = options.configHome;
    fs.mkdirSync(rootDir, { recursive: true });
  } else {
    const base = resolveCodexHomeBase();
    fs.mkdirSync(base, { recursive: true });
    rootDir = fs.mkdtempSync(path.join(base, "codex-to-llm-home-"));
  }

  const targetAuth = path.join(rootDir, "auth.json");
  fs.copyFileSync(authPath, targetAuth);

  const config = [
    'web_search = "disabled"',
    'sqlite_home = ":memory:"',
    "[mcp_servers]",
    "[features]",
    "shell_snapshot = false",
    "unified_exec = false",
    "multi_agent = false",
    "apps = false",
    "plugins = false",
    "js_repl = false",
    "prevent_idle_sleep = false",
    "[history]",
    'persistence = "none"'
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
