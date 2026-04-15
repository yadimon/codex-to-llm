import fs from "node:fs";
import path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";

const packageRoot = process.cwd();
const testDir = path.join(packageRoot, "test");
const testFiles = fs
  .readdirSync(testDir)
  .filter(name => name.endsWith(".test.ts"))
  .sort()
  .map(name => path.join(testDir, name));

let failed = false;
const stream = run({
  files: testFiles,
  isolation: "none",
  execArgv: ["--import", "tsx/esm"]
});

stream.on("test:fail", () => {
  failed = true;
});

stream.on("done", () => {
  process.exitCode = failed ? 1 : 0;
});

stream.compose(spec()).pipe(process.stdout);
