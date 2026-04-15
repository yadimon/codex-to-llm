# codex-to-llm workspace

Monorepo for a minimal Codex-backed LLM adapter and an OpenAI-compatible HTTP server on top of it.

## Packages

- `@yadimon/codex-to-llm`: SDK and CLI for prompt and chat-style Codex execution
- `@yadimon/codex-to-llm-server`: OpenAI-compatible Responses server package built on top of the core adapter

## Requirements

- Node.js `>=20`
- installed `codex` CLI in `PATH`
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## Workspace commands

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
npm run test:docker
npm run release:check
```

Useful smoke commands:

```bash
npm run smoke:core
npm run smoke:server
npm run start:server
npm run start:server:mock
```

## Release flow

This repository publishes two npm packages from one GitHub repository:

- `@yadimon/codex-to-llm`
- `@yadimon/codex-to-llm-server`

They are versioned independently and released with package-specific tags:

- `codex-to-llm-v<version>`
- `codex-to-llm-server-v<version>`

Maintainer commands:

```bash
npm run check
npm run release:core:patch
npm run release:server:patch
```

The full maintainer guide lives in `RELEASING.md`.

## Start the server

```bash
npm run start --workspace @yadimon/codex-to-llm-server
```

Then call:

```bash
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/v1/models
```

## Environment variables

| Variable | Default | Package | Description |
|---|---|---|---|
| `CODEX_TO_LLM_AUTH_PATH` | `~/.codex/auth.json` | core | Path to the Codex `auth.json` file. |
| `CODEX_TO_LLM_CLI_PATH` | `codex` | core | Path to the Codex CLI binary. |
| `CODEX_TO_LLM_LOCAL_HOME` | `.codex-to-llm/` | core | Local directory used by `auth:copy`. |
| `CODEX_MIN_AUTH_PATH` | - | core | Backward-compatible alias for `CODEX_TO_LLM_AUTH_PATH`. |
| `CODEX_MIN_LOCAL_HOME` | - | core | Backward-compatible alias for `CODEX_TO_LLM_LOCAL_HOME`. |
| `CODEX_TO_LLM_REASONING_EFFORT` | `low` | core | Default reasoning effort forwarded to `codex exec`. |
| `CODEX_TO_LLM_SANDBOX` | `read-only` | core | Sandbox mode passed to `codex exec`. |
| `CODEX_TO_LLM_CONFIG_HOME` | temp dir | core | Temporary Codex config directory for a run. |
| `CODEX_TO_LLM_WORKSPACE` | temp dir | core | Workspace directory passed with `-C`. |
| `CODEX_TO_LLM_SERVER_HOST` | `127.0.0.1` | server | HTTP bind host. |
| `CODEX_TO_LLM_SERVER_PORT` | `3000` | server | HTTP bind port. |
| `CODEX_TO_LLM_SERVER_MODELS` | default model | server | Comma-separated allowlist of accepted models. |
| `CODEX_TO_LLM_SERVER_DEFAULT_MODEL` | `gpt-5.3-codex-spark` | server | Fallback model used when the request omits `model`. |
| `COMPAT_API_KEY` | - | server | Bearer token accepted for `/v1/responses`. |
| `CODEX_TO_LLM_SERVER_API_KEY` | - | server | Alternate bearer token env var for `/v1/responses`. |
| `CODEX_TO_LLM_SERVER_MOCK_MODE` | - | server | Enables the mock runner for local testing. |
| `CODEX_TO_LLM_SERVER_MOCK_RESPONSE` | `mock response` | server | Mock response text returned by the mock runner. |

## Docker

Build from the repository root:

```bash
docker build -f packages/codex-to-llm-server/Dockerfile .
```

The container expects Codex auth at runtime, for example via a mounted auth file and `CODEX_TO_LLM_AUTH_PATH`.
