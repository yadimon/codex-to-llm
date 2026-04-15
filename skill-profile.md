# Skill Profile

## Scope
- skill: project-quality-maintenance
- purpose: keep the npm workspace reliable, release-safe, and docs-aligned without expanding product scope

## Stable Repo Facts
- repo_type: npm workspace monorepo
- workspace_shape: root workspace plus two published packages under `packages/`
- major_components:
  - `packages/codex-to-llm`: core SDK and CLI wrapper for `codex exec`
  - `packages/codex-to-llm-server`: Responses-compatible HTTP server built on the core package
  - `scripts/`: workspace verification and release helpers

## Maintenance Defaults
- preferred_baseline_commands:
  - `npm run verify`
  - `npm run check`
- preferred_quality_gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run check`
- known_hotspots:
  - package build and release scripts in `package.json` files
  - GitHub Actions workflows under `.github/workflows/`
  - CLI e2e scripts under `packages/*/scripts/`
- do_not_touch_areas:
  - local auth material under `.codex-to-llm/`, `.codex-minimal/`, and `tmp-auth/`

## Key Files
- `forever-improve-loop.md`
- `README.md`
- `RELEASING.md`
- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`

## Key Commands
- `npm run verify`
- `npm run check`
- `npm run test:docker`
- `npm run release:check`

## Constraints
- no_feature_work: yes
- commit_only_when_tier0_tier1_green: yes

## Known Drift Or Gotchas
- publish automation depends on annotated or explicitly pushed tags, not local lightweight tags
- local Windows builds can hit transient `dist/` cleanup races, so build-script changes need verification through pack and publish dry runs

## Last Confirmed State
- verified_at: 2026-04-15
- notes: both GitHub CI and npm publish for `0.1.1` were green before this maintenance cycle
