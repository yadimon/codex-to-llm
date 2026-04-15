# Health Check

## Scope

- Repository: `yadimon/codex-to-llm`
- Objective: verify that the workspace is locally healthy, releasable, and aligned with the currently published `0.1.1` packages.
- Baseline commit at generation time: `e2c849e`
- Last reviewed: `2026-04-15`

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

## Manual or External Checks

| ID | Method | Expected result | Severity |
| --- | --- | --- | --- |
| HC-EXT-001 | GitHub Actions API for recent runs | latest `CI` and release `Publish` runs are `success` | critical |
| HC-EXT-002 | npm registry dist-tags | both public packages report `latest: 0.1.1` | critical |

## Known Weak Points

- Release publishing depends on annotated package tags reaching GitHub; broken tag push logic blocks npm deployment.
- The package e2e checks are sensitive to CI platform behavior, especially executable fixtures on Unix and server startup synchronization.
- Windows cleanup of `dist/` can be racy; build scripts now retry, but this path deserves continued scrutiny.
- The server package intentionally tracks the core package version range; releases that change core behavior should confirm the server dependency bump remains correct.

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

- Overall classification: `HEALTHY`
- Execution date: `2026-04-15`

| ID | Status | Evidence |
| --- | --- | --- |
| HC-AUTO-001 | pass | `git status --short` returned no output on `e2c849e` |
| HC-AUTO-002 | pass | `npm run verify` exited `0` after lint, typecheck, tests, e2e, and both workspace builds |
| HC-AUTO-003 | pass | `npm run check` exited `0` after `verify`, `pack`, and `publish:dry-run` for both packages |
| HC-AUTO-004 | pass | `npm run test:docker` exited `0` and rebuilt the server image successfully |
| HC-EXT-001 | pass | GitHub API reports latest `CI` on `main` and both `Publish` runs for `codex-to-llm-v0.1.1` and `codex-to-llm-server-v0.1.1` as `success` |
| HC-EXT-002 | pass | npm registry `dist-tags.latest` equals `0.1.1` for both `@yadimon/codex-to-llm` and `@yadimon/codex-to-llm-server` |
