# codex-to-llm

Use an existing local Codex sign-in as a small, stateless LLM interface for scripts, evaluations, and trusted local services.

This monorepo publishes two packages:

| Need | Package | Interface |
|---|---|---|
| Call Codex from a Node.js script or one-off command | [`@yadimon/codex-to-llm`](./packages/codex-to-llm/README.md) | SDK + CLI |
| Point a Responses API client at a local HTTP service | [`@yadimon/codex-to-llm-server`](./packages/codex-to-llm-server/README.md) | `POST /v1/responses` + SSE |

> This is a community project, not an official OpenAI package. It is local-first and intentionally implements a small subset of an LLM/API stack.

## Quick start

Prerequisites:

- Node.js `>=20`
- a working Codex sign-in in `~/.codex/auth.json`
- the `codex` CLI in `PATH` for the default backend

### One prompt from the CLI

```bash
npx @yadimon/codex-to-llm --prompt "Return only the word OK."
```

### One prompt from Node.js

```bash
npm install @yadimon/codex-to-llm
```

```js
import { runPrompt } from "@yadimon/codex-to-llm";

const result = await runPrompt("Return only the word OK.", {
  model: "gpt-5.3-codex-spark",
  reasoningEffort: "low",
  maxTokens: 32
});

console.log(result.content);
```

### A local Responses endpoint

```bash
npx @yadimon/codex-to-llm-server
```

In another terminal:

```bash
curl http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.3-codex-spark","input":"Return only the word OK."}'
```

## Which package should I use?

Use the core package when one process owns the call: evaluation scripts, batch classification, translations, test fixtures, or a small application integration. It returns a compact response object with text, usage, and raw Codex events.

Use the server when an existing application already speaks the OpenAI Responses shape, several local processes need one HTTP endpoint, or the boundary belongs in Docker. The server adds model allowlisting, optional bearer authentication, health/model endpoints, request validation, and SSE.

The server does **not** implement `/v1/chat/completions`. A Chat Completions-only client needs a separate adapter or gateway; it is not a drop-in OpenAI API replacement.

## Execution modes

Both packages default to `codex exec`. Each call gets an isolated temporary Codex home and workspace, ephemeral history, disabled tools, disabled web search, and in-memory runtime SQLite state.

An experimental `codex-oauth` direct mode can skip the Codex subprocess and call the ChatGPT/Codex Responses backend with the token in `auth.json`. That mode is explicit opt-in, requires risk confirmation, and must remain a trusted local integration. See the package READMEs before using it.

## Workspace development

```bash
npm install
npm run verify
```

Useful commands:

```bash
npm run smoke:core
npm run smoke:server
npm run test:docker
npm run release:check
```

Repository layout:

```text
packages/codex-to-llm         SDK, CLI, process runner, direct-call client
packages/codex-to-llm-server  Responses HTTP adapter and Dockerfile
scripts                       workspace test, smoke, and release helpers
```

Maintainer release instructions are in [`RELEASING.md`](./RELEASING.md).

## Security boundary

Treat `~/.codex/auth.json` as a secret. Do not commit it, bake it into an image, forward it to a browser, or expose a subscription-backed server as a public proxy. Bind local services to loopback, and set `CODEX_TO_LLM_SERVER_API_KEY` before allowing access from another host or container network.
