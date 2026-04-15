# Skill Profile

## Target

- Primary artifact: `health-check.md`
- Repository type: npm workspace monorepo with two published packages and GitHub Actions based release automation

## Stable Facts

- The root package is private and orchestrates workspace-level verification and release checks.
- `@yadimon/codex-to-llm` is the core SDK and CLI package.
- `@yadimon/codex-to-llm-server` is the Responses-compatible HTTP server package.
- The most important local health commands are:
  - `git status --short`
  - `npm run verify`
  - `npm run check`
  - `npm run test:docker`
- Release health also depends on external verification of GitHub Actions and npm dist-tags.

## Current Risk Themes

- Release success depends on package-specific annotated tags reaching `origin`.
- CI reliability depends on keeping the core and server e2e tests deterministic across Unix and Windows assumptions.
- Build cleanup on Windows remains an area worth re-checking after tooling changes.

## Last Confirmed State

- Reviewed on: `2026-04-15`
- Baseline commit: `e2c849e`
- Expected published versions during this review: `0.1.1` for both public packages
- Last known classification before this run: `HEALTHY`
