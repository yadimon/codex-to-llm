# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm workspace with two published packages.

- `packages/codex-to-llm`: core SDK and CLI that wraps `codex exec` for prompt and chat-style use.
- `packages/codex-to-llm-server`: HTTP server that exposes a Responses-compatible API on top of the core package.
- `scripts/`: root workspace helpers for running tests and release checks across packages.
- `.codex-to-llm/`, `.codex-minimal/`, and `tmp-auth/`: local auth or scratch directories; keep them out of commits.

## Build, Test, and Development Commands

- `npm install`: install workspace links and generate the root lockfile.
- `npm test`: run unit, integration, and local e2e checks across both packages.
- `npm run test:docker`: build the server image and verify container behavior against live HTTP endpoints.
- `npm run release:check`: run all local tests, package packing checks, and the Docker e2e path.
- `npm run smoke:core`: run the core SDK smoke test.
- `npm run smoke:server`: boot the server package with a stub runner and print its URL.
- `npm run start --workspace @yadimon/codex-to-llm-server`: start the local HTTP server.

## Coding Style & Naming Conventions

Use modern ESM TypeScript only. Match the existing repo style exactly:

- 2-space indentation
- `camelCase` for functions and variables
- lowercase hyphenated filenames for scripts
- keep platform-specific process behavior explicit and testable

Prefer adding shared logic to `packages/codex-to-llm` first; the server package should stay a thin adapter.

## Testing Guidelines

Tests use `node:test` with package-local runners under each `scripts/run-node-tests.ts`.

- place tests in `packages/*/test/*.test.ts`
- name tests after observable behavior
- cover Windows and Linux process-path assumptions when CLI behavior changes
- add HTTP tests for sync and SSE behavior when server response handling changes

Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines

Use Conventional Commits, for example `feat: add responses streaming adapter` or `fix: normalize cli direct execution`.

PRs should include:

- a short description of the change and why it is needed
- test evidence (`npm test`, `npm run release:check`, or both)
- API examples when request or response behavior changes
- notes about auth, Docker, or release implications when relevant

## Security & Configuration Tips

Never commit real Codex auth files. Prefer `CODEX_TO_LLM_AUTH_PATH`, `npm run auth:copy --workspace @yadimon/codex-to-llm`, or local-only mounted secrets for Docker runs.

## TypeScript Tooling

- root `npm run build` compiles both workspaces with `tsc`
- root `npm run typecheck` runs project references without emitting files
- root `npm run lint` uses the shared flat ESLint config
- published package entrypoints resolve from `dist/`
