#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runResponse, streamResponse } from "./index.js";
const args = process.argv.slice(2);
export const HELP_TEXT = `codex-to-llm

Usage:
  codex-to-llm --prompt "Hi"
  codex-to-llm --input-file ./chat.json --json
  codex-to-llm --stdin-json --stream --json

Options:
  --prompt <text>
  --input-json <json>
  --input-file <path>
  --stdin-json
  --stream
  --json
  --model <name>
  --reasoning-effort <level>
  --max-tokens <n>
  --sandbox <mode>
  --auth-path <path>
  --config-home <path>
  --cwd <path>
  --cli <path>`;
function getArg(name, fallback) {
    const index = args.indexOf(name);
    if (index !== -1 && args[index + 1]) {
        return args[index + 1];
    }
    return fallback;
}
function hasFlag(name) {
    return args.includes(name);
}
async function readStdin() {
    return new Promise((resolve, reject) => {
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => {
            input += chunk;
        });
        process.stdin.on("end", () => resolve(input.trim()));
        process.stdin.on("error", reject);
    });
}
async function readCliInput() {
    const inlinePrompt = getArg("--prompt");
    if (inlinePrompt) {
        return inlinePrompt;
    }
    const inputJson = getArg("--input-json");
    if (inputJson) {
        return parseJsonInput(inputJson, "--input-json");
    }
    const inputFile = getArg("--input-file");
    if (inputFile) {
        return parseJsonInput(fs.readFileSync(inputFile, "utf8"), "--input-file");
    }
    const stdinText = await readStdin();
    if (!stdinText) {
        throw new Error("Prompt or JSON input is required");
    }
    if (hasFlag("--stdin-json")) {
        return parseJsonInput(stdinText, "--stdin-json");
    }
    return stdinText;
}
function buildRunOptions() {
    const maxTokensArg = getArg("--max-tokens");
    return {
        model: getArg("--model"),
        reasoningEffort: getArg("--reasoning-effort"),
        maxTokens: maxTokensArg ? Number.parseInt(maxTokensArg, 10) : undefined,
        sandbox: getArg("--sandbox"),
        authPath: getArg("--auth-path"),
        configHome: getArg("--config-home"),
        cwd: getArg("--cwd"),
        cliPath: getArg("--cli")
    };
}
function parseJsonInput(raw, source) {
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Invalid JSON for ${source}`);
    }
}
export async function main() {
    if (hasFlag("--help") || hasFlag("-h")) {
        console.log(HELP_TEXT);
        return;
    }
    const input = await readCliInput();
    const options = buildRunOptions();
    if (hasFlag("--stream")) {
        for await (const event of streamResponse(input, options)) {
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
    const result = await runResponse(input, options);
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
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
//# sourceMappingURL=cli.js.map