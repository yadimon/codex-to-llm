# @yadimon/codex-to-llm

Minimal SDK and CLI wrapper for raw prompt requests through Codex auth.

## Install

```bash
npm install @yadimon/codex-to-llm
```

Requirements:

- Node.js `>=20`
- installed `codex` CLI in `PATH` or `CODEX_TO_LLM_CLI_PATH` for the default `codex exec` path
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## What It Provides

- a small SDK for raw prompt execution with minimal prompt overhead
- a CLI for direct prompt mode from flags, files, or stdin
- an explicit direct API call mode that bypasses the Codex CLI when confirmed
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
--direct-api-call
--confirm-direct-api-risk
--instructions <text>
--direct-api-endpoint <url>
--model <name>
--reasoning-effort <level>
--max-tokens <n>
--sandbox <mode>
--auth-path <path>
--config-home <path>
--cwd <path>
--cli <path>
```

## Direct API Call Mode

The default CLI path still shells out to `codex exec`. Direct API call mode is a separate opt-in for local experiments that use the OAuth access token in Codex `auth.json` and call the ChatGPT/Codex Responses backend directly.

```bash
npx @yadimon/codex-to-llm \
  --direct-api-call \
  --confirm-direct-api-risk \
  --model gpt-5.3-codex-spark \
  --instructions "Translate the input and return only the translation." \
  --prompt "Translate to French: Hello"
```

The confirmation flag is required. You can also set `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1` for non-interactive runs. Direct mode also requires `--instructions`; the package does not inject a hidden assistant persona or default system prompt.

Direct mode bypasses the Codex CLI agent harness. It does not create a temporary workspace, inject repository instructions, add tool definitions, or spawn the `codex` binary. The request is sent as a single user message with `stream: true` and `store: false`; non-streaming CLI output is aggregated locally from the upstream SSE stream.

This mode is intentionally local-first. It is not the public OpenAI API-key endpoint, and it should not be exposed as a public proxy. OpenAI's Services Agreement says API integrations are allowed as customer applications, but it also prohibits reselling or leasing account access, transferring API keys, bypassing rate limits or protective measures, and configuring services to avoid usage limits: https://openai.com/policies/services-agreement/. OpenAI's API authentication docs also say API keys are secret and should not be shared or exposed client-side: https://platform.openai.com/docs/api-reference/authentication.

### Parallel Translation Example

Direct mode is useful for many small, independent calls where the Codex CLI startup harness would dominate latency and prompt overhead. For example, from Codex you can ask:

```text
Run 20 parallel translation tasks with:
npx @yadimon/codex-to-llm --direct-api-call --confirm-direct-api-risk --model gpt-5.3-codex-spark --instructions "Translate the input. Return only the translation." --prompt "<one element translation prompt>"

Translate each element independently and collect the outputs in order.
```

Use an explicit instruction in each call, for example:

```bash
npx @yadimon/codex-to-llm \
  --direct-api-call \
  --confirm-direct-api-risk \
  --model gpt-5.3-codex-spark \
  --instructions "Translate the input to German. Return only the translation." \
  --prompt "The item text to translate"
```

For production batch workloads, prefer the official OpenAI API/Batch API when available for your account and model. Direct mode is best treated as a local subscription-auth bypass for trusted, short-lived automation.

### Direct Mode Smoke Test

The live smoke test intentionally requires explicit risk confirmation:

```bash
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 npm run smoke:direct-api
```

It performs the minimal direct API call with Codex auth, user-supplied instructions, and a tiny `Say hi.` prompt. Without `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1`, the smoke exits before making any network request.

## Runtime Configuration

The wrapper creates an isolated temporary `CODEX_HOME` and workspace by default. Its generated `config.toml` keeps web search disabled unless you opt in with `webSearch`, `--search`, `--web-search`, or `CODEX_TO_LLM_WEB_SEARCH`.

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Path to the Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Path to the Codex CLI binary. |
| `CODEX_TO_LLM_WEB_SEARCH` | `disabled` | Web search mode passed to Codex as `web_search`. |
| `CODEX_TO_LLM_IGNORE_RULES` | `false` | When truthy, pass `--ignore-rules` to `codex exec`. |
| `CODEX_TO_LLM_IGNORE_USER_CONFIG` | `false` | When truthy, pass `--ignore-user-config` to `codex exec`. |
| `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK` | - | Must be `1` when using `--direct-api-call` without `--confirm-direct-api-risk`. |
| `CODEX_TO_LLM_DIRECT_API_ENDPOINT` | `https://chatgpt.com/backend-api/codex/responses` | Direct-mode upstream endpoint override. |
| `CODEX_TO_LLM_CODEX_CLIENT_VERSION` | `0.134.0` | Direct-mode `Version` header. |
| `CODEX_TO_LLM_CODEX_USER_AGENT` | `codex-cli/0.134.0` | Direct-mode `User-Agent` header. |
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
