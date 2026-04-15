# @yadimon/codex-to-llm

Minimal LLM-style SDK and CLI wrapper around `codex exec`.

## What it provides

- a small SDK for single-turn and chat-style requests
- a CLI for prompt mode or JSON chat input
- structured streaming events for adapters such as HTTP compatibility servers

## Install

```bash
npm install @yadimon/codex-to-llm
```

Requirements:

- Node.js `>=20`
- installed `codex` CLI in `PATH` or `CODEX_TO_LLM_CLI_PATH`
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## SDK

```ts
import { runResponse, type ConversationInput } from "@yadimon/codex-to-llm";

const input: ConversationInput = {
  instructions: "Answer briefly.",
  messages: [
    { role: "user", content: "Hello" }
  ]
};

const result = await runResponse(input, {
  model: "gpt-5.3-codex-spark",
  maxTokens: 128
});

console.log(result.content);
console.log(result.usage);
```

## CLI

```bash
codex-to-llm --prompt "Hello"
codex-to-llm --input-file ./chat.json --json
codex-to-llm --input-file ./chat.json --stream --json
```

Build and verification:

```bash
npm run build --workspace @yadimon/codex-to-llm
npm run lint --workspace @yadimon/codex-to-llm
npm run typecheck --workspace @yadimon/codex-to-llm
```

## Release checks

```bash
npm test
npm run e2e
npm run release:check
```
