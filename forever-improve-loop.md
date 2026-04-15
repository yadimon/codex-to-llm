# Forever Improvement Plan

Last verified: 2026-04-15 04:10
Verification mode: full-refresh

## 1) Scope And Guardrails
- Mode: quality-only, no new end-user features.
- Allowed: tests, bugfixes, safe refactors, dead-code cleanup, duplication cleanup, lint or format cleanup, typing improvements, comments, docs sync.
- Forbidden: product feature expansion.

## 2) Workspace Fingerprint
- Repo shape: monorepo

### Workspace Markers
- package.json

### Package/Runtime Tools
- npm

### Languages
- JavaScript (1 files)
- Markdown (8 files)
- TypeScript (39 files)

### Frameworks And Libraries
- TypeScript

### Workspace Or Package Roots
- packages\codex-to-llm
- packages\codex-to-llm-server

## 3) Baseline Snapshot
- Date/time: 2026-04-15 04:10
- Branch/commit: `main` at `679d32d`
- Baseline commands:
- npm --prefix "packages\codex-to-llm" run build
- npm --prefix "packages\codex-to-llm" run e2e
- npm --prefix "packages\codex-to-llm" run lint
- npm --prefix "packages\codex-to-llm" run pack:check
- npm --prefix "packages\codex-to-llm" run release:check
- npm --prefix "packages\codex-to-llm" run smoke:cli
- npm --prefix "packages\codex-to-llm" run smoke:sdk
- npm --prefix "packages\codex-to-llm" run test
- npm --prefix "packages\codex-to-llm" run typecheck
- npm --prefix "packages\codex-to-llm-server" run build
- npm --prefix "packages\codex-to-llm-server" run e2e
- npm --prefix "packages\codex-to-llm-server" run lint
- npm --prefix "packages\codex-to-llm-server" run pack:check
- npm --prefix "packages\codex-to-llm-server" run release:check
- npm --prefix "packages\codex-to-llm-server" run smoke
- npm --prefix "packages\codex-to-llm-server" run test
- npm --prefix "packages\codex-to-llm-server" run test:docker
- npm --prefix "packages\codex-to-llm-server" run typecheck
- npm run build
- npm run check
- npm run lint
- npm run release:check
- npm run smoke:core
- npm run smoke:server
- npm run test
- npm run test:all
- npm run test:docker
- npm run typecheck
- npm run verify
- Baseline results:
  - pre-cycle baseline: `npm run verify` passed
  - post-cycle validation: `npm run check` passed

If baseline is red:
- Pause new improvements.
- Fix failing tests or existing code first.
- Prefer fixing tests when behavior is intended and tests are stale or flaky.

## 4) Smoke Verification Before Reuse
- Confirm repo shape still matches: monorepo
- Confirm key workspace markers still exist:
- package.json
- Confirm baseline commands still exist:
- npm --prefix "packages\codex-to-llm" run e2e
- npm --prefix "packages\codex-to-llm" run smoke:cli
- npm --prefix "packages\codex-to-llm" run smoke:sdk
- npm --prefix "packages\codex-to-llm" run test
- npm --prefix "packages\codex-to-llm-server" run e2e
- npm --prefix "packages\codex-to-llm-server" run smoke
- npm --prefix "packages\codex-to-llm-server" run test
- npm --prefix "packages\codex-to-llm-server" run test:docker
- npm run smoke:core
- npm run smoke:server
- Confirm listed quality tools still match the repo:
- .editorconfig
- ESLint
- ESLint config
- TypeScript compiler
- If any major mismatch appears, regenerate this file and compare with the previous version before continuing.

## 5) Prioritized Backlog
Track only tasks that fit guardrails.

| ID | Priority | Category | Files/Area | Planned Change | Validation Commands | Status |
|---|---|---|---|---|---|---|
| Q-001 | P0 | baseline | workspace | Keep Tier 0 and Tier 1 green before any further maintenance work | `npm run verify` | done |
| Q-002 | P1 | reliability | `packages/codex-to-llm/package.json`, `packages/codex-to-llm-server/package.json` | Harden `dist` cleanup in build scripts against transient Windows removal failures | `npm test --workspace @yadimon/codex-to-llm`; `npm test --workspace @yadimon/codex-to-llm-server`; `npm run check` | done |
| Q-003 | P1 | docs | repo maintenance files | Keep repo-local maintenance inventory and defaults aligned with the actual workspace | update maintenance files | done |
| Q-004 | P2 | docs | release and README docs | Recheck docs drift after the next release-flow change | `npm run check` | todo |

Priority:
- P0: failing checks, flaky tests, reproducible bugs, and broken automation.
- P1: high-value tests, refactors, dead-code cleanup, docs drift, typing, and duplication cleanup.
- P2: lower-risk cleanup and maintainability improvements.

## 6) Quality Tooling And Cleanup
### Linters And Type Checks
#### Commands
- npm --prefix "packages\codex-to-llm" run build
- npm --prefix "packages\codex-to-llm" run lint
- npm --prefix "packages\codex-to-llm" run pack:check
- npm --prefix "packages\codex-to-llm" run release:check
- npm --prefix "packages\codex-to-llm" run typecheck
- npm --prefix "packages\codex-to-llm-server" run build
- npm --prefix "packages\codex-to-llm-server" run lint
- npm --prefix "packages\codex-to-llm-server" run pack:check
- npm --prefix "packages\codex-to-llm-server" run release:check
- npm --prefix "packages\codex-to-llm-server" run typecheck
- npm run build
- npm run check
- npm run lint
- npm run release:check
- npm run typecheck
- npm run verify

#### Tools
- .editorconfig
- ESLint
- ESLint config
- TypeScript compiler

### Formatters
#### Commands
- none detected

#### Tools
- .editorconfig

### Static Analysis, Dead Code, Duplication
#### Commands
- none detected

#### Tools
- ESLint
- ESLint config
- TypeScript compiler

### IDE Or MCP Assistance
- If IntelliJ MCP is available at runtime, use inspections, duplicate detection, optimize imports, and reformat.
- JetBrains module files (*.iml) detected
- JetBrains project metadata (.idea) detected

## 7) Jobs, Tests, Docs, Logic Inventory
### Package Script Inventory
- [.] build, check, lint, pack, publish:dry-run, release:check, release:core:major, release:core:minor, release:core:patch, release:server:major, release:server:minor, release:server:patch, smoke:core, smoke:server, start:server, start:server:mock, test, test:all, test:docker, typecheck, verify
- [packages\codex-to-llm] auth:copy, build, e2e, lint, pack, pack:check, prepack, publish:dry-run, release:check, smoke:cli, smoke:sdk, test, typecheck
- [packages\codex-to-llm-server] build, e2e, lint, pack, pack:check, prepack, publish:dry-run, release:check, smoke, start, start:mock, test, test:docker, typecheck

### Jobs/Workflows (directories)
- .github\workflows

### Jobs/Workflows (files)
- packages\codex-to-llm\src\queue.ts
- packages\codex-to-llm\test\queue.test.ts

### Test Commands
- npm --prefix "packages\codex-to-llm" run e2e
- npm --prefix "packages\codex-to-llm" run smoke:cli
- npm --prefix "packages\codex-to-llm" run smoke:sdk
- npm --prefix "packages\codex-to-llm" run test
- npm --prefix "packages\codex-to-llm-server" run e2e
- npm --prefix "packages\codex-to-llm-server" run smoke
- npm --prefix "packages\codex-to-llm-server" run test
- npm --prefix "packages\codex-to-llm-server" run test:docker
- npm run smoke:core
- npm run smoke:server
- npm run test
- npm run test:all
- npm run test:docker

### Test Files (sample)
- packages\codex-to-llm\test\cli.test.ts
- packages\codex-to-llm\test\core.test.ts
- packages\codex-to-llm\test\fixtures\fake-codex.cmd
- packages\codex-to-llm\test\fixtures\fake-codex.mjs
- packages\codex-to-llm\test\fs.test.ts
- packages\codex-to-llm\test\package.test.ts
- packages\codex-to-llm\test\parse.test.ts
- packages\codex-to-llm\test\queue.test.ts
- packages\codex-to-llm\test\spawn.test.ts
- packages\codex-to-llm-server\scripts\docker-e2e.ts
- packages\codex-to-llm-server\test\cli.test.ts
- packages\codex-to-llm-server\test\package.test.ts
- packages\codex-to-llm-server\test\server.test.ts

### Docs Files To Keep Aligned
- packages\codex-to-llm\README.md
- packages\codex-to-llm-server\README.md
- README.md

### Core Logic Hotspots (sample)
- .idea\jsLibraryMappings.xml
- packages\codex-to-llm\src\index.ts
- packages\codex-to-llm\src\queue.ts
- packages\codex-to-llm\test\core.test.ts
- packages\codex-to-llm\test\queue.test.ts
- packages\codex-to-llm-server\scripts\e2e-server.ts
- packages\codex-to-llm-server\scripts\smoke-server.ts
- packages\codex-to-llm-server\scripts\start-mock-server.ts
- packages\codex-to-llm-server\src\index.ts
- packages\codex-to-llm-server\test\server.test.ts

## 8) Verification Matrix
### Tier 0 (always)
- Impacted tests
- Impacted lint, type, or format checks

### Tier 1 (required)
- npm --prefix "packages\codex-to-llm" run build
- npm --prefix "packages\codex-to-llm" run e2e
- npm --prefix "packages\codex-to-llm" run lint
- npm --prefix "packages\codex-to-llm" run pack:check
- npm --prefix "packages\codex-to-llm" run release:check
- npm --prefix "packages\codex-to-llm" run smoke:cli
- npm --prefix "packages\codex-to-llm" run smoke:sdk
- npm --prefix "packages\codex-to-llm" run test
- npm --prefix "packages\codex-to-llm" run typecheck
- npm --prefix "packages\codex-to-llm-server" run build
- npm --prefix "packages\codex-to-llm-server" run e2e
- npm --prefix "packages\codex-to-llm-server" run lint
- npm --prefix "packages\codex-to-llm-server" run pack:check
- npm --prefix "packages\codex-to-llm-server" run release:check
- npm --prefix "packages\codex-to-llm-server" run smoke
- npm --prefix "packages\codex-to-llm-server" run test
- npm --prefix "packages\codex-to-llm-server" run test:docker
- npm --prefix "packages\codex-to-llm-server" run typecheck
- npm run build
- npm run check
- npm run lint
- npm run release:check
- npm run smoke:core
- npm run smoke:server
- npm run test
- npm run test:all
- npm run test:docker
- npm run typecheck
- npm run verify

### Tier 2 (deep)
- manual browser flow check
- npm --prefix "packages\codex-to-llm-server" run start
- npm --prefix "packages\codex-to-llm-server" run start:mock
- npm --prefix "packages\codex-to-llm-server" run test:docker
- npm run start:server
- npm run start:server:mock
- npm run test:docker
- repo-specific e2e or integration validation

## 9) Commit Policy
- Commit each completed and safely tested improvement.
- Follow project commit rules first (AGENTS.md, CONTRIBUTING.md); fallback to Conventional Commits only if no rule applies.
- Keep one improvement per commit.
- Do not commit when Tier 0 or Tier 1 fails.

## 10) Docs, Comments, And Cleanup Rules
- Remove unused functions, imports, files, and stale helpers when safe.
- Add comments only where behavior is non-obvious or risky.
- Keep comments concise and maintenance-focused.
- Update README and docs when commands, structure, or behavior diverge from reality.
- Run formatter or linter autofix only when it matches repo standards.

## 11) Autonomous Loop Rules
- One backlog item per cycle.
- Never continue after failing Tier 0 or Tier 1.
- Re-run the full baseline after big or cross-cutting changes.
- Update this file after each cycle.

## 12) Recent Cycle History
- 2026-04-15: completed one maintenance cycle to harden both package build scripts with retry-aware `dist` cleanup and added regression assertions in package tests. Verification: `npm run verify`, package-local tests for both packages, and `npm run check`.
