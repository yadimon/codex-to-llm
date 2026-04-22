#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCliArgReader,
  runPrompt,
  streamPrompt
} from "./index.js";
import type { RunOptions, WebSearchMode } from "./types.js";

const args = process.argv.slice(2);
const { getArg, hasFlag } = createCliArgReader(args);
export const HELP_TEXT = `codex-to-llm

Usage:
  codex-to-llm --prompt "Hi"
  codex-to-llm --input-file ./prompt.txt --json
  cat ./prompt.txt | codex-to-llm --stream --json

Options:
  --prompt <text>
  --input-file <path>
  --stream
  --json
  --verbose
  --model <name>
  --reasoning-effort <level>
  --max-tokens <n>
  --sandbox <mode>
  --search
  --web-search <disabled|cached|live>
  --ignore-rules
  --ignore-user-config
  --auth-path <path>
  --config-home <path>
  --cwd <path>
  --cli <path>`;

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

async function readCliInput(): Promise<string> {
  const inlinePrompt = getArg("--prompt");
  if (inlinePrompt != null) {
    return inlinePrompt;
  }

  const inputFile = getArg("--input-file");
  if (inputFile) {
    return fs.readFileSync(inputFile, "utf8");
  }

  const stdinPrompt = await readStdin();
  if (!stdinPrompt.length) {
    throw new Error("Prompt input is required");
  }

  return stdinPrompt;
}

function buildRunOptions(): RunOptions {
  const maxTokensArg = getArg("--max-tokens");
  const webSearchArg = parseWebSearchArg(getArg("--web-search"));

  return {
    model: getArg("--model"),
    reasoningEffort: getArg("--reasoning-effort"),
    maxTokens: maxTokensArg ? Number.parseInt(maxTokensArg, 10) : undefined,
    sandbox: getArg("--sandbox"),
    webSearch: webSearchArg || (hasFlag("--search") ? "live" : undefined),
    ignoreRules: hasFlag("--ignore-rules"),
    ignoreUserConfig: hasFlag("--ignore-user-config"),
    authPath: getArg("--auth-path"),
    configHome: getArg("--config-home"),
    cwd: getArg("--cwd"),
    cliPath: getArg("--cli")
  };
}

function parseWebSearchArg(value: string | undefined): WebSearchMode | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "disabled" || value === "cached" || value === "live") {
    return value;
  }

  throw new Error('Invalid --web-search: expected "disabled", "cached", or "live"');
}
export async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const input = await readCliInput();
  const options = buildRunOptions();

  if (hasFlag("--stream")) {
    for await (const event of streamPrompt(input, options)) {
      if (hasFlag("--json")) {
        process.stdout.write(`${JSON.stringify(event)}\n`);
        continue;
      }

      if (event.type === "response.output_text.delta") {
        process.stdout.write(event.delta);
      }
    }
    return;
  }

  const result = await runPrompt(input, options);
  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  process.stdout.write(result.content);
}

const modulePath = fs.realpathSync.native(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? fs.realpathSync.native(path.resolve(process.argv[1])) : null;
const isDirectExecution = Boolean(invokedPath) && invokedPath === modulePath;

if (isDirectExecution) {
  main().catch(error => {
    if (hasFlag("--verbose") && error instanceof Error && error.stack) {
      console.error(error.stack);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });
}
