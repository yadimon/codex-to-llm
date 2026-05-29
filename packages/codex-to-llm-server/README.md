# @yadimon/codex-to-llm-server

OpenAI-compatible Responses server on top of the raw prompt core in `@yadimon/codex-to-llm`.

## Install

```bash
npm install -g @yadimon/codex-to-llm-server
```

Or run it without installing globally:

```bash
npx @yadimon/codex-to-llm-server
```

Requirements:

- Node.js `>=20`
- installed `codex` CLI in `PATH` or `CODEX_TO_LLM_CLI_PATH` for the default `codex-exec` backend
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## Endpoints

- `POST /v1/responses`
- `GET /v1/models`
- `GET /healthz`

## Start

```bash
npx @yadimon/codex-to-llm-server
```

Then call:

```bash
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/v1/models
```

Example response request:

```bash
curl http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex-spark",
    "input": "Say hello in one short sentence."
  }'
```

Streaming example:

```bash
curl http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex-spark",
    "stream": true,
    "input": "Count from 1 to 3."
  }'
```

Local development commands:

```bash
npm run start --workspace @yadimon/codex-to-llm-server
npm run start:mock --workspace @yadimon/codex-to-llm-server
```

## ChatGPT/Codex Subscription Direct Mode

The default backend remains `codex-exec`, which shells out to `codex exec`.
For local experiments, the server can instead call the ChatGPT/Codex Responses backend directly with the OAuth access token from the Codex auth file:

```bash
CODEX_TO_LLM_BACKEND=codex-oauth \
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 \
npx @yadimon/codex-to-llm-server
```

Equivalent CLI flag:

```bash
CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 \
npx @yadimon/codex-to-llm-server --backend codex-oauth
```

This mode does not spawn `codex`, create a temporary workspace, inject `AGENTS.md`, or add the server's prompt-adapter prelude. It forwards the request as Responses-shaped input with `stream: true` and `store: false`, then aggregates the upstream SSE stream when the client requests a non-streaming response.

The direct endpoint is not the public OpenAI API-key endpoint. It uses ChatGPT/Codex subscription OAuth and may change, reject fields, rate-limit, or stop working. Startup requires `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1`, and the CLI prints a warning whenever this backend is selected. Keep it bound to `127.0.0.1` unless you also configure your own server API key and network controls.

Do not expose this as a public proxy. OpenAI's Services Agreement says API integrations are allowed as customer applications, but it also prohibits reselling or leasing account access, transferring API keys, bypassing rate limits or protective measures, and configuring services to avoid usage limits: https://openai.com/policies/services-agreement/. OpenAI's API authentication docs also say API keys are secret and should not be shared or exposed client-side: https://platform.openai.com/docs/api-reference/authentication.

Current direct-mode limitations:

- `max_output_tokens` is accepted by the local API but stripped before the Codex subscription endpoint because that endpoint is known to reject it.
- missing or empty `instructions` are not replaced with a hidden assistant persona; callers should send explicit instructions if they need policy or style control.
- OAuth refresh is not implemented in this package yet. If the stored access token is rejected, refresh it with the Codex login flow and retry.
- binding `codex-oauth` mode to anything other than `127.0.0.1`, `localhost`, or `::1` requires `CODEX_TO_LLM_SERVER_API_KEY`.

## Authentication

If you set `CODEX_TO_LLM_SERVER_API_KEY`, only `POST /v1/responses` requires a bearer token. `GET /healthz` and `GET /v1/models` stay public.

Example:

```bash
curl http://127.0.0.1:3000/v1/responses \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex-spark",
    "input": "Hello"
  }'
```

## Runtime Configuration

| Variable | Default | Description |
|---|---|---|
| `CODEX_TO_LLM_SERVER_HOST` | `127.0.0.1` | HTTP bind host. |
| `CODEX_TO_LLM_SERVER_PORT` | `3000` | HTTP bind port. |
| `CODEX_TO_LLM_SERVER_DEFAULT_MODEL` | `gpt-5.3-codex-spark` | Fallback model when the request omits `model`. |
| `CODEX_TO_LLM_SERVER_MODELS` | default model | Comma-separated allowlist of accepted models. |
| `CODEX_TO_LLM_SERVER_API_KEY` | - | Bearer token accepted for `POST /v1/responses`. |
| `CODEX_TO_LLM_SERVER_MOCK_MODE` | - | Enables the mock runner for local testing. |
| `CODEX_TO_LLM_SERVER_MOCK_RESPONSE` | `mock response` | Mock response text returned by the mock runner. |
| `CODEX_TO_LLM_BACKEND` | `codex-exec` | Backend runner. Use `codex-oauth` for direct ChatGPT/Codex subscription mode. |
| `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK` | - | Must be `1` to start `codex-oauth` mode. |
| `CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT` | `https://chatgpt.com/backend-api/codex/responses` | Direct-mode upstream endpoint override for tests or experiments. |
| `CODEX_TO_LLM_CODEX_CLIENT_VERSION` | `0.134.0` | Direct-mode `Version` header. |
| `CODEX_TO_LLM_CODEX_USER_AGENT` | `codex-cli/0.134.0` | Direct-mode `User-Agent` header. |
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | Path to the Codex auth file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | Path to the Codex CLI binary. |
| `CODEX_TO_LLM_CONFIG_HOME` | temp dir | Temporary Codex config directory for a run. |
| `CODEX_TO_LLM_WORKSPACE` | temp dir | Workspace directory used for Codex execution. |
| `CODEX_TO_LLM_WEB_SEARCH` | `disabled` | Web search mode forwarded to the core runner. |
| `CODEX_TO_LLM_IGNORE_RULES` | `false` | When truthy, pass `--ignore-rules` to the core runner. |
| `CODEX_TO_LLM_IGNORE_USER_CONFIG` | `false` | When truthy, pass `--ignore-user-config` to the core runner. |
| `CODEX_TO_LLM_REASONING_EFFORT` | `low` | Default reasoning effort passed to the core runner. |
| `CODEX_TO_LLM_SANDBOX` | `read-only` | Default sandbox mode passed to the core runner. |

## Behavior Notes

- `GET /healthz` and `GET /v1/models` stay public even when bearer auth is configured
- `POST /v1/responses` validates requested models against `CODEX_TO_LLM_SERVER_MODELS`
- `max_output_tokens` and `reasoning.effort` are forwarded to the core runner
- in `codex-oauth` mode, `reasoning.effort` is forwarded but `max_output_tokens` is stripped from the upstream request
- server CLI supports `--search`, `--web-search`, `--ignore-rules`, and `--ignore-user-config`
- unsupported request fields such as `tools`, `tool_choice`, or `input_image` return `400`
- the server owns prompt adaptation for `instructions` and multi-message dialog input before calling the raw core runner
- streaming emits one `response.output_text.delta` per Codex `agent_message`, not per token; clients expecting token-level deltas will see one large delta followed by `response.completed`
- multi-message dialog input is flattened into a single text prompt with `### role` headers; user-supplied content is not escaped, so a message that mimics those headers is observable in the prompt the model receives. Validate untrusted input upstream before forwarding it

## Docker

Build from the repository root:

```bash
docker build -f packages/codex-to-llm-server/Dockerfile .
docker run -p 3000:3000 -v ~/.codex/auth.json:/run/secrets/codex-auth.json:ro \
  -e CODEX_TO_LLM_AUTH_PATH=/run/secrets/codex-auth.json codex-to-llm-server
```

## Development

```bash
npm run build --workspace @yadimon/codex-to-llm-server
npm run lint --workspace @yadimon/codex-to-llm-server
npm run typecheck --workspace @yadimon/codex-to-llm-server
```
