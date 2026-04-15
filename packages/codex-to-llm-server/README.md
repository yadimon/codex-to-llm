# @yadimon/codex-to-llm-server

OpenAI-compatible Responses server on top of `@yadimon/codex-to-llm`.

## Endpoints

- `POST /v1/responses`
- `GET /v1/models`
- `GET /healthz`

## Start

```bash
npx @yadimon/codex-to-llm-server
```

Or locally:

```bash
npm run start --workspace @yadimon/codex-to-llm-server
npm run start:mock --workspace @yadimon/codex-to-llm-server
```

## Config

- `CODEX_TO_LLM_SERVER_HOST`
- `CODEX_TO_LLM_SERVER_PORT`
- `CODEX_TO_LLM_SERVER_DEFAULT_MODEL`
- `CODEX_TO_LLM_SERVER_MODELS`
- `COMPAT_API_KEY`
- `CODEX_TO_LLM_AUTH_PATH`
- `CODEX_TO_LLM_CLI_PATH`

Notes:

- `GET /healthz` and `GET /v1/models` stay public even when bearer auth is configured
- `POST /v1/responses` validates requested models against `CODEX_TO_LLM_SERVER_MODELS`
- `max_output_tokens` and `reasoning.effort` are forwarded to the core runner

Build and verification:

```bash
npm run build --workspace @yadimon/codex-to-llm-server
npm run lint --workspace @yadimon/codex-to-llm-server
npm run typecheck --workspace @yadimon/codex-to-llm-server
```

## Docker

Build from the repo root:

```bash
docker build -f packages/codex-to-llm-server/Dockerfile .
docker run -p 3000:3000 -v ~/.codex/auth.json:/run/secrets/codex-auth.json:ro \
  -e CODEX_TO_LLM_AUTH_PATH=/run/secrets/codex-auth.json codex-to-llm-server
```

Local verification:

```bash
npm run e2e --workspace @yadimon/codex-to-llm-server
npm run test:docker --workspace @yadimon/codex-to-llm-server
```
