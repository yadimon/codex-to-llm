import * as fs from "node:fs";
import * as path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";

const repoRoot = process.cwd();
const testDir = path.join(repoRoot, "test");
const testFiles = fs
  .readdirSync(testDir)
  .filter(name => name.endsWith(".test.ts"))
  .sort()
  .map(name => path.join(testDir, name));

const stream = run({
  files: testFiles,
  isolation: "none",
  execArgv: ["--import", "tsx/esm"]
});

// Set the exit code as failures arrive. The stream returned by run() emits "end",
// not "done", so deferring this to a "done" listener never ran and the runner
// reported failing tests while still exiting 0.
stream.on("test:fail", () => {
  process.exitCode = 1;
});

stream.compose(spec()).pipe(process.stdout);
