import { runNpm } from "./workspace-helpers.js";

const workspaces = [
  "@yadimon/codex-to-llm",
  "@yadimon/codex-to-llm-server"
];

for (const workspace of workspaces) {
  runNpm(["run", "test", "--workspace", workspace]);
}

for (const workspace of workspaces) {
  runNpm(["run", "e2e", "--workspace", workspace]);
}
