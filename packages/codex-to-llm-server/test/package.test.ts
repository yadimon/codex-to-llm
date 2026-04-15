import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

test("package.json exposes server dist entrypoints and workspace dependency", () => {
  assert.equal(packageJson.name, "@yadimon/codex-to-llm-server");
  assert.equal(packageJson.bin["codex-to-llm-server"], "dist/cli.js");
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.dependencies["@yadimon/codex-to-llm"], "^0.1.0");
  assert.equal(packageJson.scripts.e2e, "tsx ./scripts/e2e-server.ts");
  assert.equal(packageJson.scripts["start:mock"], "tsx ./scripts/start-mock-server.ts");
  assert.equal(packageJson.scripts["test:docker"], "tsx ./scripts/docker-e2e.ts");
});

test("published files include docker assets", () => {
  assert.deepEqual(packageJson.files, ["dist", "scripts", "README.md", "LICENSE", "Dockerfile"]);
  assert.equal(fs.existsSync(path.join(process.cwd(), "Dockerfile")), true);
});
