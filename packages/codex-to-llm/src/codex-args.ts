import type { NormalizedRunOptions } from "./types.js";

export function buildCodexArgs(options: NormalizedRunOptions, workspace: string): string[] {
  const {
    model,
    reasoningEffort,
    maxTokens,
    sandbox,
    webSearch,
    ignoreRules,
    ignoreUserConfig
  } = options;

  return [
    "exec",
    ...(ignoreUserConfig ? ["--ignore-user-config"] : []),
    ...(ignoreRules ? ["--ignore-rules"] : []),
    "--json",
    "--color",
    "never",
    "--sandbox",
    sandbox,
    "--ephemeral",
    "-C",
    workspace,
    "--skip-git-repo-check",
    "--disable",
    "undo",
    "--disable",
    "shell_tool",
    "--disable",
    "child_agents_md",
    "--disable",
    "apply_patch_freeform",
    "--disable",
    "remote_models",
    "--model",
    model,
    "-c",
    `model_reasoning_effort="${reasoningEffort}"`,
    "-c",
    `model_max_output_tokens=${maxTokens}`,
    "-c",
    `web_search="${webSearch}"`,
    "-"
  ];
}
