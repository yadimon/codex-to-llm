import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { npmCacheDir, repoRoot } from "./workspace-helpers.js";

type BumpType = "patch" | "minor" | "major";
type ReleaseTarget = {
  workspaceName: string;
  bumpType: BumpType;
  tagPrefix: string;
  packageJsonPath: string;
  version?: string;
};

const CORE_WORKSPACE = "@yadimon/codex-to-llm";
const SERVER_WORKSPACE = "@yadimon/codex-to-llm-server";

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
  const releaseTargets = getReleaseTargets();
  bumpReleaseTargets(releaseTargets);
  hydrateReleaseTargetVersions(releaseTargets);
  refreshWorkspaceLockfile();
  runGit(["add", ...collectFilesToAdd(releaseTargets)]);
  runGit(["commit", "-m", createReleaseCommitMessage(releaseTargets)]);
  const tagNames = createReleaseTags(releaseTargets);
  runGit(["push", "origin", "HEAD", ...tagNames]);
}

function syncServerDependencyToCore(): void {
  const corePackageJson = JSON.parse(
    fs.readFileSync(getWorkspacePackageJsonPath(CORE_WORKSPACE), "utf8")
  ) as {
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

function getReleaseTargets(): ReleaseTarget[] {
  if (releaseWorkspace === CORE_WORKSPACE) {
    return [
      createReleaseTarget(CORE_WORKSPACE, releaseBumpType, releaseTagPrefix),
      createReleaseTarget(SERVER_WORKSPACE, "patch", "codex-to-llm-server")
    ];
  }

  return [createReleaseTarget(releaseWorkspace, releaseBumpType, releaseTagPrefix)];
}

function createReleaseTarget(
  workspaceName: string,
  bumpType: BumpType,
  tagPrefix: string
): ReleaseTarget {
  return {
    workspaceName,
    bumpType,
    tagPrefix,
    packageJsonPath: getWorkspacePackageJsonPath(workspaceName)
  };
}

function getWorkspacePackageJsonPath(workspaceName: string): string {
  return path.join(repoRoot, "packages", workspaceName.replace(/^@[^/]+\//, ""), "package.json");
}

function bumpReleaseTargets(releaseTargets: ReleaseTarget[]): void {
  for (const releaseTarget of releaseTargets) {
    runNpm([
      "version",
      releaseTarget.bumpType,
      "--workspace",
      releaseTarget.workspaceName,
      "--no-git-tag-version"
    ]);

    if (releaseTarget.workspaceName === CORE_WORKSPACE) {
      syncServerDependencyToCore();
    }
  }
}

function hydrateReleaseTargetVersions(releaseTargets: ReleaseTarget[]): void {
  for (const releaseTarget of releaseTargets) {
    const packageJson = JSON.parse(fs.readFileSync(releaseTarget.packageJsonPath, "utf8")) as {
      version: string;
    };
    releaseTarget.version = packageJson.version;
  }
}

function collectFilesToAdd(releaseTargets: ReleaseTarget[]): string[] {
  return ["package-lock.json", ...new Set(releaseTargets.map(releaseTarget => releaseTarget.packageJsonPath))];
}

function createReleaseCommitMessage(releaseTargets: ReleaseTarget[]): string {
  const summary = releaseTargets
    .map(releaseTarget => `${releaseTarget.tagPrefix} v${getReleaseTargetVersion(releaseTarget)}`)
    .join(", ");
  return `chore(release): ${summary}`;
}

function createReleaseTags(releaseTargets: ReleaseTarget[]): string[] {
  const tagNames: string[] = [];

  for (const releaseTarget of releaseTargets) {
    const tagName = `${releaseTarget.tagPrefix}-v${getReleaseTargetVersion(releaseTarget)}`;
    runGit(["tag", "-a", tagName, "-m", `Release ${tagName}`]);
    tagNames.push(tagName);
  }

  return tagNames;
}

function getReleaseTargetVersion(releaseTarget: ReleaseTarget): string {
  if (!releaseTarget.version) {
    throw new Error(`Release target version missing for ${releaseTarget.workspaceName}`);
  }

  return releaseTarget.version;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
