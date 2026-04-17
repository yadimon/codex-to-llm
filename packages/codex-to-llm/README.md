# @yadimon/codex-to-llm

SDK and CLI wrapper around `codex exec` for single-turn and chat-style requests.

## Install

```bash
npm install @yadimon/codex-to-llm
```

Requirements:

- Node.js `>=20`
- installed `codex` CLI in `PATH` or `CODEX_TO_LLM_CLI_PATH`
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## What It Provides

- a small SDK for single-turn and chat-style requests
- a CLI for prompt mode or JSON chat input
- structured streaming events for adapters such as HTTP compatibility servers

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

For streamed events:

```ts
import { streamResponse } from "@yadimon/codex-to-llm";

for await (const event of streamResponse("Hello", {
  model: "gpt-5.3-codex-spark"
})) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

## CLI

```bash
codex-to-llm --prompt "Hello"
codex-to-llm --input-file ./chat.json --json
cat ./chat.json | codex-to-llm --stdin-json --stream --json
```

Supported CLI options:

```text
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
--cli <path>
```

## Runtime Configuration

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Path to the Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Path to the Codex CLI binary. |
| `CODEX_TO_LLM_REASONING_EFFORT` | `low` | Default reasoning effort passed to Codex. |
| `CODEX_TO_LLM_SANDBOX` | `read-only` | Sandbox mode passed to Codex. |
| `CODEX_TO_LLM_CONFIG_HOME` | temp dir | Temporary Codex config directory for a run. |
| `CODEX_TO_LLM_WORKSPACE` | temp dir | Workspace directory passed to Codex. |
| `CODEX_TO_LLM_LOCAL_HOME` | `.codex-to-llm/` | Local directory used by the auth copy helper. |

## Development

```bash
npm run build --workspace @yadimon/codex-to-llm
npm run lint --workspace @yadimon/codex-to-llm
npm run typecheck --workspace @yadimon/codex-to-llm
```
