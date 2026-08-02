# @yadimon/codex-to-llm

Run a stateless prompt through your local Codex sign-in from Node.js or the command line.

The package is useful when you need model output inside a script without starting an interactive coding-agent session. It keeps the interface deliberately small: prompt in, text and usage out.

> Community package; not an official OpenAI SDK. Node.js `>=20` is required.

## Install

```bash
npm install @yadimon/codex-to-llm
```

The default mode also requires:

- an installed `codex` CLI in `PATH` (or `CODEX_TO_LLM_CLI_PATH`)
- a valid Codex login at `~/.codex/auth.json` (or `CODEX_TO_LLM_AUTH_PATH`)

## Quick start

### SDK

```js
import { runPrompt } from "@yadimon/codex-to-llm";

const result = await runPrompt("Classify this as positive or negative: I love it.", {
  model: "gpt-5.3-codex-spark",
  reasoningEffort: "low",
  maxTokens: 32
});

console.log(result.content);
console.log(result.usage);
```

`runPrompt()` returns:

```ts
{
  id: string;
  model: string;
  prompt: string;
  createdAt: number;
  content: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  raw: { stderr: string; events: unknown[] };
}
```

### CLI

```bash
npx @yadimon/codex-to-llm --prompt "Return only the word OK."
npx @yadimon/codex-to-llm --input-file ./prompt.txt --json
npx @yadimon/codex-to-llm --input-file ./prompt.txt --stream --json
```

Run `npx @yadimon/codex-to-llm --help` for the full option list.

## SDK patterns

### Streaming

```js
import { streamPrompt } from "@yadimon/codex-to-llm";

for await (const event of streamPrompt("Explain closures in two sentences.")) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

In the default `codex exec` mode, a delta corresponds to a Codex `agent_message`, not necessarily one token. Short answers may therefore arrive as one large delta.

### Reuse defaults

```js
import { createRunner } from "@yadimon/codex-to-llm";

const fastReadOnly = createRunner({
  model: "gpt-5.3-codex-spark",
  reasoningEffort: "low",
  maxTokens: 128,
  timeout: 60_000
});

const result = await fastReadOnly.runPrompt("Summarize this release note: ...");
```

Call options override the defaults passed to `createRunner()`.

### Small parallel evaluation

```js
import { runPrompt } from "@yadimon/codex-to-llm";

const cases = [
  "Return the sentiment of: Great work.",
  "Return the sentiment of: This is broken.",
  "Return the sentiment of: It is acceptable."
];

const results = await Promise.all(
  cases.map(prompt => runPrompt(prompt, { maxTokens: 16 }))
);

console.log(results.map(result => result.content));
```

Every default-mode call starts its own Codex process and isolated temporary home. The package does not add concurrency limits, retries, or a job queue; add those in the caller for larger batches.

## Default mode: `codex exec`

This is the recommended mode. For each call the package:

1. copies the selected Codex auth file into an isolated per-run `CODEX_HOME`;
2. creates a temporary workspace unless `cwd` is supplied;
3. runs `codex exec --ephemeral` with JSON output;
4. disables history persistence, shell/tool surfaces, plugins, multi-agent, and web search by default;
5. parses text, usage, and raw events, then removes package-owned temporary directories.

Useful options:

| Option | Default | Purpose |
|---|---|---|
| `model` | `gpt-5.3-codex-spark` | Codex model name. |
| `reasoningEffort` | `low` | Reasoning effort passed to Codex. |
| `maxTokens` | `64` | Requested maximum output tokens. |
| `timeout` | `300000` | Process timeout in milliseconds. |
| `sandbox` | `read-only` | Codex sandbox mode. |
| `webSearch` | `disabled` | `disabled`, `cached`, or `live`. |
| `cwd` | temporary directory | Workspace passed to Codex. Supplied directories are not deleted. |
| `configHome` | temporary directory | Explicit Codex home. Supplied directories are not deleted. |
| `signal` | - | Abort a running call with an `AbortSignal`. |

`--search` is CLI shorthand for `--web-search live`.

`ignoreUserConfig` / `--ignore-user-config` tells Codex to skip the generated per-run `config.toml`. That file is what disables web search, tools, plugins, and other agent features, so use the option only when you explicitly want raw Codex behavior.

## Experimental direct API mode

Direct mode skips the `codex` process and sends one user message to the ChatGPT/Codex Responses backend using the OAuth token in `auth.json`.

Use it only for trusted, local, short-lived automation. It is not the public OpenAI API-key endpoint, it can change without notice, and it must not be exposed as a public or shared proxy.

Two explicit inputs are required:

- risk confirmation: `--confirm-direct-api-risk` or `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1`
- caller-owned instructions: `--instructions` / `directApiInstructions`

CLI:

```bash
npx @yadimon/codex-to-llm \
  --direct-api-call \
  --confirm-direct-api-risk \
  --model gpt-5.3-codex-spark \
  --instructions "Translate to German. Return only the translation." \
  --prompt "The package is ready."
```

SDK:

```js
import { runPrompt } from "@yadimon/codex-to-llm";

const result = await runPrompt("The package is ready.", {
  directApiCall: true,
  confirmDirectApiRisk: true,
  directApiInstructions: "Translate to German. Return only the translation.",
  model: "gpt-5.3-codex-spark",
  reasoningEffort: "low",
  signal: AbortSignal.timeout(30_000)
});

console.log(result.content);
```

Direct-mode differences:

- no temporary workspace, generated Codex config, repository instructions, or tool definitions;
- upstream is always requested with `stream: true` and `store: false`; `runPrompt()` aggregates the SSE events locally;
- `maxTokens` and `timeout` are not sent by this direct client; use an `AbortSignal` for a deadline;
- only one text user message is constructed by the core package;
- no OAuth refresh, retries, rate limiting, or stability guarantee is provided.

For recurring or production batch workloads, prefer the official OpenAI API or Batch API when available for the model and account.

The local-only boundary also follows OpenAI's [Services Agreement](https://openai.com/policies/services-agreement/) restrictions around account access, credentials, limits, and resale, and the [API authentication guidance](https://platform.openai.com/docs/api-reference/authentication) to keep credentials secret.

### Direct-mode smoke test (repository checkout)

PowerShell:

```powershell
$env:CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK = "1"
npm run smoke:direct-api
```

macOS/Linux:

```bash
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 npm run smoke:direct-api
```

The script exits before any network request if the confirmation variable is missing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Codex CLI command or path. |
| `CODEX_TO_LLM_WEB_SEARCH` | `disabled` | Default web-search mode. |
| `CODEX_TO_LLM_IGNORE_RULES` | `false` | Pass `--ignore-rules` to Codex. |
| `CODEX_TO_LLM_IGNORE_USER_CONFIG` | `false` | Skip the package-generated Codex config. |
| `CODEX_TO_LLM_ENV_PASSTHROUGH` | - | Comma-separated extra environment names passed to the Codex child. |
| `CODEX_TO_LLM_HOME_BASE` | platform data directory | Base for generated per-run Codex homes. |
| `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK` | - | Set to `1` to confirm direct-mode risk. |
| `CODEX_TO_LLM_DIRECT_API_ENDPOINT` | ChatGPT/Codex backend | Direct-mode endpoint override for testing. |
| `CODEX_TO_LLM_CODEX_CLIENT_VERSION` | `0.144.1` | Direct-mode `Version` header. |
| `CODEX_TO_LLM_CODEX_USER_AGENT` | `codex-cli/0.144.1` | Direct-mode `User-Agent` header. |

## Troubleshooting

- **`Codex CLI not found` or `ENOENT`:** install the Codex CLI, check `codex --version`, or set `CODEX_TO_LLM_CLI_PATH` / `cliPath` to the executable.
- **`Codex auth not found`:** sign in with Codex or point `CODEX_TO_LLM_AUTH_PATH` / `authPath` at the correct `auth.json`. Never commit that file.
- **The response is cut short:** increase `maxTokens` above its intentionally small default of `64`. In direct mode this option is not forwarded upstream.
- **A call hangs or must follow a client disconnect:** default mode has a five-minute timeout. Set `timeout` and/or pass an `AbortSignal`. Direct mode uses the signal but not the `timeout` option.
- **Web search or agent behavior is missing:** those capabilities are disabled intentionally. Opt into web search explicitly. `ignoreUserConfig` enables broader raw Codex behavior and also bypasses the package's hardening.

## Development

```bash
npm run build --workspace @yadimon/codex-to-llm
npm run lint --workspace @yadimon/codex-to-llm
npm run typecheck --workspace @yadimon/codex-to-llm
npm test --workspace @yadimon/codex-to-llm
```
