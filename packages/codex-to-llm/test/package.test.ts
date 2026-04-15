import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

test("package.json exposes dist entrypoints and release checks", () => {
  assert.equal(packageJson.name, "@yadimon/codex-to-llm");
  assert.equal(packageJson.bin["codex-to-llm"], "./dist/cli.js");
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.scripts.test, "tsx ./scripts/run-node-tests.ts");
  assert.equal(packageJson.scripts.e2e, "tsx ./scripts/e2e-cli.ts");
  assert.equal(packageJson.scripts.prepack, "npm run test && npm run build");
  assert.equal(packageJson.scripts["release:check"], "tsx ./scripts/release-check.ts");
  assert.equal(packageJson.engines.node, ">=20");
});

test("published files include dist artifacts and documentation", () => {
  assert.deepEqual(packageJson.files, ["dist", "scripts", "README.md", "LICENSE"]);
});

test("CLI entry file keeps a portable shebang for npm bin shims", () => {
  const cliSource = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf8");

  assert.equal(cliSource.startsWith("#!/usr/bin/env node"), true);
});
