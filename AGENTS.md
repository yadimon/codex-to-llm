# Repository Guidelines

Canonical guidance for humans and coding agents working in this repository. `CLAUDE.md` imports this file.

## Workspace shape

npm workspaces monorepo (`workspaces: ["packages/*"]`, `type: "module"`, Node `>=20`). The root is private and owns the single lockfile. Two publishable packages:

- `packages/codex-to-llm` (`@yadimon/codex-to-llm`) — core SDK + `codex-to-llm` CLI that wraps `codex exec`. All shared logic lives here.
- `packages/codex-to-llm-server` (`@yadimon/codex-to-llm-server`) — thin HTTP adapter exposing `/healthz`, `/v1/models`, `/v1/responses` (sync + SSE). Depends on core via a `^` range that is bumped automatically on core releases.
- `scripts/` — root helpers for workspace tests, release checks, and published-package smokes.
- `.codex-to-llm/`, `.codex-minimal/`, `tmp-auth/` — local auth or scratch directories; never commit them.

When adding behavior, put it in core first. The server package stays a transport/adapter layer.

## Commands

Root (runs across both workspaces):

```bash
npm install                 # workspace links + single root lockfile
npm run lint                # flat ESLint config (@typescript-eslint/no-explicit-any: error)
npm run typecheck           # tsc -b project references, no emit
npm test                    # root repo tests + each workspace's test and e2e scripts
npm run build               # tsc -b both workspaces (core dist/ must exist before server)
npm run verify              # lint + typecheck + test + build (PR gate)
npm run check               # verify + pack + publish:dry-run (pre-release gate)
npm run release:check       # full release readiness incl. Docker e2e
npm run test:docker         # build the server image and verify against live HTTP

npm run smoke:core          # SDK smoke against the real codex CLI
npm run smoke:server        # boot the server with a stub runner
npm run smoke:vision        # image input through core and server (real CLI)
npm run smoke:direct-api    # direct Responses endpoint; needs CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1
npm run smoke:published     # clean-install the published core, server, and npx paths
npm run smoke:published-vision   # same, with image input
npm run start:server        # run the HTTP server locally
npm run start:server:mock   # run the server with the built-in mock runner
```

Per package (`npm run <script> --workspace <name>` or `cd packages/<name>`): `test`, `e2e`, `lint`, `typecheck`, `build`, `pack`, `publish:dry-run`, `smoke:*`. A single test file: `tsx --test packages/codex-to-llm/test/parse.test.ts`.

## Architecture

### Core package (`packages/codex-to-llm/src/`)

Public surface is re-exported from `index.ts`.

- `runner.ts` — `runPrompt` / `streamPrompt` spawn the `codex` CLI and translate its newline-delimited JSON event stream into typed `StreamEvent`s. Helpers: `options.ts` (`normalizeRunOptions`), `codex-args.ts` (`buildCodexArgs`, pure and unit-tested), `exit.ts` (`createCodexExitError`, `appendBounded`, `buildAbortError`), `lifecycle.ts` (`terminate` with SIGTERM → grace → SIGKILL), `env.ts` (`buildChildEnv` allowlist).
- `workspace.ts` — ephemeral Codex home and workspace per call; auth/config resolution.
- `spawn.ts`, `platform.ts` — process spawning and CLI path resolution, with Windows-specific handling.
- `images.ts` — image input normalization for `--image` / `images`: local paths, HTTPS URLs, and data URLs. Enforces supported media types with signature detection, `MAX_IMAGE_COUNT`, per-image and total byte caps, bounded URL downloads (timeout, redirect cap), and temporary-file cleanup. Do not weaken these when extending image support.
- `direct-api.ts` — `runPromptDirectApi` / `streamPromptDirectApi` call the Codex Responses endpoint directly instead of spawning the CLI. Risk-gated: refuses to run unless `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1` (`assertDirectApiRiskConfirmed`).
- `parse.ts`, `queue.ts`, `types.ts` (`DEFAULT_MODEL`, `DEFAULT_REASONING_EFFORT = "low"`), `cli-args.ts`, `cli.ts`.

Key invariants:

- Each call gets an **ephemeral** Codex home (`createCodexHome` in `workspace.ts`) with a fresh copy of `auth.json` and a hardened `config.toml` that disables web search, MCP, shell snapshot, unified exec, multi-agent, apps, js_repl, and idle-sleep prevention. The home lives under `resolveCodexHomeBase()` — `%LOCALAPPDATA%\codex-to-llm\homes` on Windows, `$XDG_DATA_HOME/codex-to-llm/homes` on POSIX, overridable via `CODEX_TO_LLM_HOME_BASE` — **never under the OS temp dir**, because recent codex CLIs refuse to install helper binaries when `codex_home` sits under a temp/world-writable parent.
- Each call also gets an ephemeral workspace dir under the OS temp (the child's cwd). Both directories are cleaned up on success and failure (`cleanupDirectory` tolerates `EBUSY`/`ENOTEMPTY`/`EPERM` on Windows). On failure, cleanup runs **after** the child has actually terminated.
- The CLI invocation is locked down: `--ephemeral`, `--skip-git-repo-check`, `--sandbox <mode>`, and `--disable` flags for `undo`, `shell_tool`, `plugins`, `apply_patch_freeform`, `remote_models` (see `codex-args.ts`). Prompts go via stdin (trailing `-`); images go via repeated `--image <path>`.
- All CLI tokens flow through `normalizeCliToken` (`^[A-Za-z0-9._:/-]+$`, no leading `-`). Do not bypass it when adding options — it is the injection guard.
- `RunOptions.signal` cancels a run through the same `finalizeFailure` path as a timeout, so the child is terminated and cleanup still runs.
- The child does **not** inherit the full parent env. `buildChildEnv` passes a fixed allowlist (PATH, HOME/USERPROFILE, TEMP/TMP, LANG/LC_*, Windows system vars, proxy/CA vars) plus `CODEX_HOME`. Forward more names with `RunOptions.envPassthrough` or `CODEX_TO_LLM_ENV_PASSTHROUGH` (CSV); names must match `^[A-Za-z_][A-Za-z0-9_]*$`.
- `stderr` is bounded to 64 KiB with a truncation suffix (`appendBounded`).
- Output assembly: `agent_message` events append to `content` (joined with `\n\n`); `turn.completed` carries usage; `error` / `turn.failed` populate the last error. On non-zero exit the runner prefers stderr → last error → generic exit message.
- Windows command resolution (`spawn.ts` / `platform.ts`): use the first usable candidate in PATH order. Never replace a working shim with a WindowsApps executable just because one exists. Tests cover both Windows and POSIX paths — keep both green when touching spawn behavior. `assertCliPathExists` and `normalizeSpawnError` produce the "codex not found" messaging.

### Server package (`packages/codex-to-llm-server/src/`)

- `index.ts` — `createServer` / `startServer`, route dispatch, public re-exports. Helpers: `auth.ts`, `config.ts`, `http-io.ts`, `log.ts`, `openai-format.ts`, `prompt.ts`, `types.ts`, `validation.ts`, `cli.ts`; runners in `runners/default.ts` (spawns core), `runners/mock.ts`, `runners/codex-oauth.ts`.
- Backend selection (`config.ts`, `CODEX_TO_LLM_BACKEND`): `codex-exec` (default, spawns the CLI through core) or `codex-oauth` (calls the Codex Responses endpoint directly via `createCodexOauthRunner`; `instructions` are required in that mode).
- `serializeServerPrompt` (`prompt.ts`) lives in the server on purpose: flattening is OpenAI-Responses-specific and must not leak into core.
- `/v1/responses` rejects these **top-level** fields up front (`UNSUPPORTED_REQUEST_FIELDS` in `types.ts`): `tools`, `tool_choice`, `conversation`, `previous_response_id`, `input_audio`, `input_image`, `parallel_tool_calls`. Extend the list deliberately.
- Image input is accepted as `input_image` **content blocks inside user messages** (`prompt.ts` → `normalizeImageInputs`), then forwarded to core. Rejected outside user messages. Unknown input shapes return 400 — no silent `JSON.stringify` fallback.
- Bearer auth is enforced only when `apiKey` / `CODEX_TO_LLM_SERVER_API_KEY` is set; comparison uses `timingSafeEqual` on length-equal buffers.
- SSE: `response.created` → `response.output_text.delta` → `response.output_text.done` → `response.completed` → `data: [DONE]`, `response.failed` on error; `: ping` keepalive every 15 s; `writeSse` awaits `drain` (raced against close) on backpressure.
- Client disconnect aborts the underlying `streamPrompt` via an `AbortSignal` bound to request/response `close`; the codex child is terminated by `lifecycle.terminate`.
- Models list and default model are validated at `createServer` (empty list throws; default must be a member). Body limit 10 MiB. One JSON-lines log record per request on stdout; silence with `CODEX_TO_LLM_SERVER_LOG=off`.

### Environment variables

Core: `CODEX_TO_LLM_AUTH_PATH`, `CODEX_TO_LLM_CLI_PATH`, `CODEX_TO_LLM_CONFIG_HOME`, `CODEX_TO_LLM_HOME_BASE`, `CODEX_TO_LLM_LOCAL_HOME`, `CODEX_TO_LLM_WORKSPACE`, `CODEX_TO_LLM_SANDBOX`, `CODEX_TO_LLM_REASONING_EFFORT`, `CODEX_TO_LLM_WEB_SEARCH` (`disabled|cached|live`), `CODEX_TO_LLM_IGNORE_RULES`, `CODEX_TO_LLM_IGNORE_USER_CONFIG`, `CODEX_TO_LLM_ENV_PASSTHROUGH`, `CODEX_TO_LLM_CODEX_CLIENT_VERSION`, `CODEX_TO_LLM_CODEX_USER_AGENT`.

Direct API / OAuth: `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK`, `CODEX_TO_LLM_DIRECT_API_ENDPOINT`, `CODEX_TO_LLM_CODEX_OAUTH_ENDPOINT`.

Server: `CODEX_TO_LLM_BACKEND`, `CODEX_TO_LLM_SERVER_HOST`, `CODEX_TO_LLM_SERVER_PORT`, `CODEX_TO_LLM_SERVER_API_KEY`, `CODEX_TO_LLM_SERVER_MODELS` (CSV), `CODEX_TO_LLM_SERVER_DEFAULT_MODEL`, `CODEX_TO_LLM_SERVER_MOCK_MODE`, `CODEX_TO_LLM_SERVER_MOCK_RESPONSE`, `CODEX_TO_LLM_SERVER_LOG`, plus all core vars.

## Auth and isolation

Resolution order for Codex auth: explicit option → `CODEX_TO_LLM_AUTH_PATH` → `~/.codex/auth.json`. `prepareAuthCopy` (`npm run auth:copy --workspace @yadimon/codex-to-llm`) snapshots auth into `.codex-to-llm/` for Docker / CI runs.

Never commit real auth files. ESLint and the Docker e2e expect `.codex-to-llm/`, `.codex-minimal/`, and `tmp-auth/` to stay untracked. Prefer `CODEX_TO_LLM_AUTH_PATH` or locally mounted secrets for Docker.

## Testing

- `node:test` only (no jest/vitest). Files at `packages/*/test/*.test.ts` and `test/*.test.ts` at the root; runners are `scripts/run-root-node-tests.ts` and `packages/*/scripts/run-node-tests.ts`.
- Fixtures in `packages/codex-to-llm/test/fixtures/` (`fake-codex.mjs`, `fake-codex.cmd`) stand in for the real `codex` binary and react to `FAKE_CODEX_*` env vars. They are excluded from ESLint. `fake-codex.mjs` is executed directly on Linux CI, so it must stay tracked as executable (`git ls-files -s` shows `100755`); the root repo test asserts this.
- Name tests after observable behavior.
- Process-path / spawn changes must keep both Windows and POSIX assertions passing. Windows-specific behavior (cmd quoting, `dist/` cleanup retry, realpath) is load-bearing.
- HTTP behavior changes need both sync and SSE coverage in `packages/codex-to-llm-server/test/server.test.ts`.
- Vision smokes use an embedded, visually unambiguous image so results are deterministic; an external image URL is an optional network-path check, never the only fixture.
- Live lanes (`smoke:core`, `smoke:vision`, `smoke:direct-api`) need real Codex auth and are not part of `npm test`; `smoke:direct-api` additionally requires `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1`.

## Style

- ESM TypeScript only, Node `>=20`. 2-space indent, `camelCase` functions/variables, lowercase-hyphenated script filenames.
- `@typescript-eslint/no-explicit-any` is an error — type things properly rather than disabling.
- Keep platform-specific process behavior explicit and testable.

## Commits and pull requests

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `release(<pkg>):`, optionally scoped `(core)` / `(server)`).

PRs include a short rationale, test evidence (`npm test` and/or `npm run release:check`), API examples when request/response behavior changes, and notes on auth, Docker, or release implications when relevant. Run `npm test` before opening a PR.

## Releases

Two independently versioned packages with package-specific tags (`codex-to-llm-v<version>`, `codex-to-llm-server-v<version>`). `npm run release:core:*` / `release:server:*` run `check`, bump the selected workspace, auto-update the server's core dependency on core releases, commit, tag, and push. GitHub Actions (`.github/workflows/publish.yml`) publishes only the package matching the pushed tag via Trusted Publishing (OIDC). The full flow, including pre-release and post-publish verification, is in `RELEASING.md`.
