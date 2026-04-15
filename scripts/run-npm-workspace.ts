import { runNpm } from "./workspace-helpers.js";

const [, , workspace, scriptName] = process.argv;

if (!workspace || !scriptName) {
  console.error("Usage: tsx ./scripts/run-npm-workspace.ts <workspace> <script>");
  process.exit(1);
}

runNpm(["run", scriptName, "--workspace", workspace]);
