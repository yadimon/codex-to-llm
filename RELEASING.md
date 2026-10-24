# Releasing

This repository publishes two npm packages from one GitHub repository:

- `@yadimon/codex-to-llm`
- `@yadimon/codex-to-llm-server`

The packages are versioned independently and are released through package-specific tags.

Do not set `"private": true` in either publishable package. The root workspace stays private.

## Package tags

- core package: `codex-to-llm-v<version>`
- server package: `codex-to-llm-server-v<version>`

Examples:

- `codex-to-llm-v0.1.1`
- `codex-to-llm-server-v0.1.1`

## First Publish

This section only matters for a new package name or a fresh registry bootstrap.

For the current published packages, the one-time manual bootstrap publish is already complete.

Before the first publish:

```bash
npm login
npm run check
```

Then publish each package once manually:

```bash
npm publish --workspace @yadimon/codex-to-llm --access public
npm publish --workspace @yadimon/codex-to-llm-server --access public
```

## Trusted Publishing

After both packages exist on npm, add a Trusted Publisher for each package in npm:

- GitHub user or org: `yadimon`
- repository: `codex-to-llm`
- workflow filename: `publish.yml`
- environment: none

The publish workflow uses GitHub Actions OIDC with the npm version bundled with the selected Node runtime.

## Normal Release Flow

Choose the package and version bump type:

```bash
npm run release:core:patch
npm run release:core:minor
npm run release:core:major

npm run release:server:patch
npm run release:server:minor
npm run release:server:major
```

These scripts:

- run `npm run check` (lint, typecheck, tests, build, pack)
- bump only the selected workspace version
- update the server's `@yadimon/codex-to-llm` dependency automatically when releasing core
- rehearse `npm publish --dry-run` for the bumped workspaces only
- create a release commit
- create a package-specific Git tag
- push the commit and tag to `origin`

The rehearsal runs after the bump because from npm 11 on `npm publish --dry-run`
queries the registry and refuses a version that is already published, so it can
only pass once the version is new. `npm run check` therefore stops at packaging
validation. If the rehearsal fails, the bumped manifests and lockfile are left in
the working tree and nothing is committed, tagged or pushed; restore them with
`git checkout -- package-lock.json packages` before retrying, because the script
requires a clean tree.

GitHub Actions publishes only the package that matches the pushed tag.

## Pre-release verification

The release scripts run `npm run check` themselves; `npm run release:check` adds the Docker e2e. Neither covers the live lanes, which need real Codex auth. Run them explicitly before tagging a release that touches the runner, spawn, or image handling:

- `npm run smoke:vision` — image input through core and server against the real CLI.
- `CODEX_TO_LLM_CONFIRM_DIRECT_API_RISK=1 npm run smoke:direct-api` — direct Responses endpoint.

`npm test` also asserts that the shebang fixtures under `packages/*/test/fixtures/` stay tracked as executable (`100755`); Linux CI runs them directly, and a lost mode bit only shows up there.

## Post-publish verification

A green `Publish` run proves the tarball was accepted, not that the published artifact works. After the workflow finishes:

- `npm run smoke:published` — clean-installs the published core, server, and npx paths from the registry and exercises them.
- `npm run smoke:published-vision` — the same for image input.

## Manual Equivalent

There is deliberately no hand-written equivalent here. The release scripts are the
supported path because they enforce things a copied command list does not:

- the working tree must be clean before anything is changed
- the publish rehearsal runs on the **bumped** versions, after the lockfile refresh
  and before anything is staged, so a failed rehearsal cannot be followed by a
  commit, tag and push
- only the workspaces actually being released are rehearsed, because from npm 11 on
  `npm publish --dry-run` refuses an already published version and an untouched
  workspace would fail every time
- a core release also patches the server and rewrites its core dependency range
- every step must succeed before the next one runs

If you have to reproduce a release by hand, read `scripts/release-workspace.ts` and
keep those guarantees, rather than working from a copy of the commands that can
drift out of sync with the script.

## Notes

- `repository`, `homepage`, and `bugs` in both package manifests must match the canonical GitHub repository.
- `@yadimon/codex-to-llm-server` depends on `@yadimon/codex-to-llm`; core releases update that dependency range automatically.
- The publish workflow verifies that the pushed tag matches the target package version exactly.
