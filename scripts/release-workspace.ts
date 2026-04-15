import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

const workspacePackageJsonPath = path.join(
  repoRoot,
  "packages",
  workspaceName.replace(/^@[^/]+\//, ""),
  "package.json"
);

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
  runNpm(["version", bumpType, "--workspace", workspaceName, "--no-git-tag-version"]);

  const packageJson = JSON.parse(fs.readFileSync(workspacePackageJsonPath, "utf8")) as {
    version: string;
  };
  const version = packageJson.version;
  const tagName = `${tagPrefix}-v${version}`;

  runGit(["add", "package-lock.json", workspacePackageJsonPath]);
  runGit(["commit", "-m", `release(${tagPrefix}): ${version}`]);
  runGit(["tag", tagName]);
  runGit(["push", "origin", "HEAD", "--follow-tags"]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
