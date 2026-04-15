import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { npmCacheDir, repoRoot } from "./workspace-helpers.js";

type BumpType = "patch" | "minor" | "major";

const [, , workspaceName, bumpType, tagPrefix] = process.argv as [
  string,
  string,
  string | undefined,
  BumpType | undefined,
  string | undefined
];

if (!workspaceName || !bumpType || !tagPrefix) {
  console.error(
    "Usage: tsx ./scripts/release-workspace.ts <workspace> <patch|minor|major> <tag-prefix>"
  );
  process.exit(1);
}

const releaseWorkspace = workspaceName;
const releaseBumpType = bumpType;
const releaseTagPrefix = tagPrefix;

const workspacePackageJsonPath = path.join(
  repoRoot,
  "packages",
  releaseWorkspace.replace(/^@[^/]+\//, ""),
  "package.json"
);
const serverPackageJsonPath = path.join(repoRoot, "packages", "codex-to-llm-server", "package.json");

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
}

function runNpm(args: string[]): string {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir
      }
    });
  }

  return execFileSync("npm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir
    }
  });
}

function main(): void {
  const dirty = runGit(["status", "--short"]).trim();
  if (dirty) {
    throw new Error("Working tree must be clean before creating a release commit");
  }

  runNpm(["run", "check"]);
  runNpm(["version", releaseBumpType, "--workspace", releaseWorkspace, "--no-git-tag-version"]);

  if (releaseWorkspace === "@yadimon/codex-to-llm") {
    syncServerDependencyToCore();
  }

  refreshWorkspaceLockfile();

  const packageJson = JSON.parse(fs.readFileSync(workspacePackageJsonPath, "utf8")) as {
    version: string;
  };
  const version = packageJson.version;
  const tagName = `${releaseTagPrefix}-v${version}`;

  const filesToAdd = ["package-lock.json", workspacePackageJsonPath];
  if (releaseWorkspace === "@yadimon/codex-to-llm") {
    filesToAdd.push(serverPackageJsonPath);
  }

  runGit(["add", ...filesToAdd]);
  runGit(["commit", "-m", `release(${releaseTagPrefix}): ${version}`]);
  runGit(["tag", "-a", tagName, "-m", `Release ${tagName}`]);
  runGit(["push", "origin", "HEAD", tagName]);
}

function syncServerDependencyToCore(): void {
  const corePackageJson = JSON.parse(fs.readFileSync(workspacePackageJsonPath, "utf8")) as {
    version: string;
  };
  const serverPackageJson = JSON.parse(fs.readFileSync(serverPackageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  serverPackageJson.dependencies = {
    ...serverPackageJson.dependencies,
    "@yadimon/codex-to-llm": `^${corePackageJson.version}`
  };

  fs.writeFileSync(serverPackageJsonPath, `${JSON.stringify(serverPackageJson, null, 2)}\n`);
}

function refreshWorkspaceLockfile(): void {
  runNpm(["install", "--package-lock-only", "--ignore-scripts"]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
