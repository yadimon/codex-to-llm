# Health Check

## Scope

- Repository: `yadimon/codex-to-llm`
- Objective: verify that the workspace is locally healthy, releasable, and aligned with the currently published package versions.
- Baseline reference: current local `HEAD` at execution time
- Last reviewed: `2026-05-29`

## Preconditions

- Node.js `>=20`
- npm workspace dependencies installed via `npm install`
- Docker available locally for container verification
- Git working tree available
- Network access available for GitHub Actions and npm registry verification

## Repository Invariants

- Root workspace remains private and owns the shared lockfile.
- Exactly two published workspace packages exist:
  - `packages/codex-to-llm`
  - `packages/codex-to-llm-server`
- Release automation lives in `.github/workflows/ci.yml` and `.github/workflows/publish.yml`.
- Normal local verification must succeed before any release tag is created.
- Publish tags must stay package-specific:
  - `codex-to-llm-v<version>`
  - `codex-to-llm-server-v<version>`

## Automated Checks

| ID | Command | Expected result | Severity |
| --- | --- | --- | --- |
| HC-AUTO-001 | `git status --short` | no output | critical |
| HC-AUTO-002 | `npm run verify` | exit code `0` | critical |
| HC-AUTO-003 | `npm run check` | exit code `0` | critical |
| HC-AUTO-004 | `npm run test:docker` | exit code `0` | major |
| HC-AUTO-005 | `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 npm run smoke:direct-api` | exit code `0`; output JSON has `mode: "direct-api-call"` and non-empty `content` | major |

## Manual or External Checks

| ID | Method | Expected result | Severity |
| --- | --- | --- | --- |
| HC-EXT-001 | GitHub Actions API for recent runs | latest `CI` and release `Publish` runs are `success` | critical |
| HC-EXT-002 | npm registry dist-tags | both public packages report `latest` matching the most recent released package versions | critical |

## Known Weak Points

- Release publishing depends on annotated package tags reaching GitHub; broken tag push logic blocks npm deployment.
- The package e2e checks are sensitive to CI platform behavior, especially executable fixtures on Unix and server startup synchronization.
- Windows cleanup of `dist/` can be racy; build scripts now retry, but this path deserves continued scrutiny.
- The server package intentionally tracks the core package version range; releases that change core behavior should confirm the server dependency bump remains correct.
- Direct API call mode is intentionally risk-gated; live smoke checks must set `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1` and use local Codex auth.
- Docker Desktop `29.2.1` on this workstation currently fails BuildKit builds before Dockerfile execution with `NotFound: forwarding Ping: no such job ...`; `DOCKER_BUILDKIT=0 npm run test:docker` verifies the same Docker e2e path.

## Decision Policy

- `HEALTHY`: every critical automated check passes and every critical external check is verified.
- `AT_RISK`: no critical automated failures, but one or more external checks cannot be verified.
- `UNHEALTHY`: any critical automated check fails.

## Failure Response

- Stop release work immediately.
- Capture the failing command, exit code, and the smallest useful log excerpt.
- Fix the defect before retrying downstream checks.
- Re-run the full health check from `HC-AUTO-001`.

## Latest Execution Evidence

- Overall classification: `AT_RISK`
- Execution date: `2026-05-29`

| ID | Status | Evidence |
| --- | --- | --- |
| HC-AUTO-001 | pass | `git status --short` returned no output after commit `459f7f7` |
| HC-AUTO-002 | pass | `npm run verify` exited `0` |
| HC-AUTO-003 | pass | `npm run check` exited `0` |
| HC-AUTO-004 | pass with local Docker workaround | `npm run test:docker` fails before Dockerfile execution with Docker Desktop BuildKit `NotFound: forwarding Ping: no such job ...`; `DOCKER_BUILDKIT=0 npm run test:docker` exited `0` |
| HC-AUTO-005 | pass | `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 npm run smoke:direct-api` exited `0` and returned `content: "Hi"` |
| HC-EXT-001 | pending | verify after release tags are pushed |
| HC-EXT-002 | pending | verify after npm publish workflow completes |
