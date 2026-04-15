#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index.js";

const args = process.argv.slice(2);
export const HELP_TEXT = `codex-to-llm-server

Usage:
  codex-to-llm-server --host 127.0.0.1 --port 3000

Options:
  --host <host>
  --port <port>
  --model <name>
  --api-key <value>
  --auth-path <path>
  --config-home <path>
  --cwd <path>
  --cli <path>`;

function getArg(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }

  return fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

export async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const portArg = getArg("--port");
  const port = parsePort(portArg);
  const started = await startServer({
    host: getArg("--host"),
    port,
    defaultModel: getArg("--model"),
    apiKey: getArg("--api-key"),
    authPath: getArg("--auth-path"),
    configHome: getArg("--config-home"),
    cwd: getArg("--cwd"),
    cliPath: getArg("--cli")
  });

  console.log(`codex-to-llm-server listening on ${started.url}`);
}

function parsePort(portArg: string | undefined): number | undefined {
  if (portArg == null) {
    return undefined;
  }

  const port = Number.parseInt(portArg, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Invalid --port: expected an integer between 0 and 65535");
  }

  return port;
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
