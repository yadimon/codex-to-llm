# @yadimon/codex-to-llm

Minimal SDK and CLI wrapper around `codex exec` for raw prompt requests.

## Install

```bash
npm install @yadimon/codex-to-llm
```

Requirements:

- Node.js `>=20`
- installed `codex` CLI in `PATH` or `CODEX_TO_LLM_CLI_PATH`
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## What It Provides

- a small SDK for raw prompt execution with minimal prompt overhead
- a CLI for direct prompt mode from flags, files, or stdin
- structured streaming events for adapters such as HTTP compatibility servers

## SDK

```ts
import { runPrompt } from "@yadimon/codex-to-llm";

const result = await runPrompt("Hello", {
  model: "gpt-5.3-codex-spark",
  maxTokens: 128
});

console.log(result.content);
console.log(result.usage);
```

For streamed events:

```ts
import { streamPrompt } from "@yadimon/codex-to-llm";

for await (const event of streamPrompt("Hello", {
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
codex-to-llm --input-file ./prompt.txt --json
cat ./prompt.txt | codex-to-llm --stream --json
```

Supported CLI options:

```text
--prompt <text>
--input-file <path>
--stream
--json
--search
--web-search <disabled|cached|live>
--ignore-rules
--ignore-user-config
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

The wrapper creates an isolated temporary `CODEX_HOME` and workspace by default. Its generated `config.toml` keeps web search disabled unless you opt in with `webSearch`, `--search`, `--web-search`, or `CODEX_TO_LLM_WEB_SEARCH`.

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Path to the Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Path to the Codex CLI binary. |
| `CODEX_TO_LLM_WEB_SEARCH` | `disabled` | Web search mode passed to Codex as `web_search`. |
| `CODEX_TO_LLM_IGNORE_RULES` | `false` | When truthy, pass `--ignore-rules` to `codex exec`. |
| `CODEX_TO_LLM_IGNORE_USER_CONFIG` | `false` | When truthy, pass `--ignore-user-config` to `codex exec`. |
| `CODEX_TO_LLM_REASONING_EFFORT` | `low` | Default reasoning effort passed to Codex. |
| `CODEX_TO_LLM_SANDBOX` | `read-only` | Sandbox mode passed to Codex. |
| `CODEX_TO_LLM_CONFIG_HOME` | temp dir | Temporary Codex config directory for a run. |
| `CODEX_TO_LLM_WORKSPACE` | temp dir | Workspace directory passed to Codex. |
| `CODEX_TO_LLM_LOCAL_HOME` | `.codex-to-llm/` | Local directory used by the auth copy helper. |

Notes:

- `--search` is shorthand for `--web-search live`.
- `--ignore-user-config` keeps `CODEX_HOME` for auth, but tells Codex to skip the per-run `config.toml` this wrapper writes there. That config is what disables web search, MCP, the shell tool, multi-agent, and the other defaults in this package, so enabling the flag also bypasses that hardening. Use it only when you explicitly need raw Codex behavior.

## Development

```bash
npm run build --workspace @yadimon/codex-to-llm
npm run lint --workspace @yadimon/codex-to-llm
npm run typecheck --workspace @yadimon/codex-to-llm
```
