# codex-to-llm

Monorepo for two npm packages built around the Codex CLI:

- `@yadimon/codex-to-llm`: raw prompt SDK and CLI around `codex exec`
- `@yadimon/codex-to-llm-server`: OpenAI-compatible `/v1/responses` server that adapts dialog input on top of the raw core package

The package-level READMEs are the npm-facing docs:

- [`packages/codex-to-llm/README.md`](./packages/codex-to-llm/README.md)
- [`packages/codex-to-llm-server/README.md`](./packages/codex-to-llm-server/README.md)

## Requirements

- Node.js `>=20`
- installed `codex` CLI in `PATH`
- valid Codex auth in `~/.codex/auth.json` or `CODEX_TO_LLM_AUTH_PATH`

## Workspace Development

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
```

Useful local commands:

```bash
npm run smoke:core
npm run smoke:server
npm run start:server
npm run start:server:mock
```

## Package Layout

```text
packages/codex-to-llm
  core SDK, CLI, and process runner

packages/codex-to-llm-server
  HTTP adapter exposing /healthz, /v1/models, and /v1/responses

scripts
  workspace test, pack, and release helpers
```

## Release Flow

This repository publishes two independent npm packages:

- `@yadimon/codex-to-llm`
- `@yadimon/codex-to-llm-server`

They are versioned separately and released with package-specific tags:

- `codex-to-llm-v<version>`
- `codex-to-llm-server-v<version>`

Pre-release verification:

```bash
npm run check
npm run release:check
```

Release commands:

```bash
npm run release:core:patch
npm run release:core:minor
npm run release:core:major

npm run release:server:patch
npm run release:server:minor
npm run release:server:major
```

The detailed maintainer workflow lives in `RELEASING.md`.

## Docker

Build the server image from the repository root:

```bash
docker build -f packages/codex-to-llm-server/Dockerfile .
```

Run the Docker verification path with:

```bash
npm run test:docker
```
