import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = process.cwd();
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
) as {
  private: boolean;
  workspaces: string[];
  scripts: Record<string, string>;
};
const publishWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "publish.yml"),
  "utf8"
);
const ciWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "ci.yml"),
  "utf8"
);
const releaseScript = fs.readFileSync(path.join(repoRoot, "scripts", "release-workspace.ts"), "utf8");
const workspaceTestScript = fs.readFileSync(
  path.join(repoRoot, "scripts", "run-workspace-tests.ts"),
  "utf8"
);
const healthCheck = fs.readFileSync(path.join(repoRoot, "health-check.md"), "utf8");
const healthCheckProfile = fs.readFileSync(
  path.join(repoRoot, "skills", "healthcheck", "skill-profile.md"),
  "utf8"
);
const lockfile = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8")
) as {
  packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};
const corePackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "packages", "codex-to-llm", "package.json"), "utf8")
) as { version: string };
const serverPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "packages", "codex-to-llm-server", "package.json"), "utf8")
) as {
  version: string;
  dependencies: Record<string, string>;
};

test("root package.json keeps workspace verification wired through npm test", () => {
  assert.equal(rootPackageJson.private, true);
  assert.deepEqual(rootPackageJson.workspaces, ["packages/*"]);
  assert.equal(
    rootPackageJson.scripts.test,
    "tsx ./scripts/run-root-node-tests.ts && tsx ./scripts/run-workspace-tests.ts"
  );
  assert.equal(rootPackageJson.scripts.verify, "npm run lint && npm run typecheck && npm test && npm run build");
  assert.equal(rootPackageJson.scripts.check, "npm run verify && npm run pack && npm run publish:dry-run");
});

test("workspace test runner covers both published workspaces and both e2e paths", () => {
  assert.match(workspaceTestScript, /@yadimon\/codex-to-llm/);
  assert.match(workspaceTestScript, /@yadimon\/codex-to-llm-server/);
  assert.match(workspaceTestScript, /run", "test"/);
  assert.match(workspaceTestScript, /run", "e2e"/);
});

test("CI workflow verifies supported node versions and Docker flow", () => {
  assert.match(ciWorkflow, /name: CI/);
  assert.match(ciWorkflow, /-\s+20/);
  assert.match(ciWorkflow, /-\s+22/);
  assert.match(ciWorkflow, /name: Test core package/);
  assert.match(ciWorkflow, /name: Test server package/);
  assert.match(ciWorkflow, /name: Core e2e/);
  assert.match(ciWorkflow, /name: Server e2e/);
  assert.match(ciWorkflow, /name: Publish dry run/);
  assert.match(ciWorkflow, /docker:/);
  assert.match(ciWorkflow, /npm run test:docker/);
});

test("publish workflow keeps trusted publishing and package-specific tag guards", () => {
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /codex-to-llm-v\*/);
  assert.match(publishWorkflow, /codex-to-llm-server-v\*/);
  assert.match(publishWorkflow, /id-token: write/);
  assert.match(publishWorkflow, /npm publish --workspace @yadimon\/codex-to-llm/);
  assert.match(publishWorkflow, /npm publish --workspace @yadimon\/codex-to-llm-server/);
  assert.match(publishWorkflow, /Verify tag matches core package version/);
  assert.match(publishWorkflow, /Verify tag matches server package version/);
});

test("release script keeps annotated tags, explicit pushes, and core-to-server sync", () => {
  assert.match(releaseScript, /Working tree must be clean before creating a release commit/);
  assert.match(releaseScript, /runNpm\(\["run", "check"\]\)/);
  assert.match(releaseScript, /runNpm\(\["install", "--package-lock-only", "--ignore-scripts"\]\)/);
  assert.match(releaseScript, /runGit\(\["tag", "-a", tagName, "-m", `Release \$\{tagName\}`\]\)/);
  assert.match(releaseScript, /runGit\(\["push", "origin", "HEAD", tagName\]\)/);
  assert.match(releaseScript, /if \(releaseWorkspace === "@yadimon\/codex-to-llm"\)/);
  assert.match(releaseScript, /"@yadimon\/codex-to-llm": `\^\$\{corePackageJson\.version\}`/);
});

test("lockfile stays aligned with workspace package versions and server dependency", () => {
  assert.equal(lockfile.packages["packages/codex-to-llm"]?.version, corePackageJson.version);
  assert.equal(lockfile.packages["packages/codex-to-llm-server"]?.version, serverPackageJson.version);
  assert.equal(
    lockfile.packages["packages/codex-to-llm-server"]?.dependencies?.["@yadimon/codex-to-llm"],
    serverPackageJson.dependencies["@yadimon/codex-to-llm"]
  );
});

test("health-check artifacts exist and document the mandatory health commands", () => {
  assert.match(healthCheck, /HC-AUTO-001/);
  assert.match(healthCheck, /`git status --short`/);
  assert.match(healthCheck, /`npm run verify`/);
  assert.match(healthCheck, /`npm run check`/);
  assert.match(healthCheck, /`npm run test:docker`/);
  assert.match(healthCheck, /HC-EXT-001/);
  assert.match(healthCheck, /HC-EXT-002/);
  assert.match(healthCheckProfile, /Primary artifact: `health-check\.md`/);
  assert.match(healthCheckProfile, /npm workspace monorepo/);
});
