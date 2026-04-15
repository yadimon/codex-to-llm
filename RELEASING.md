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

- `codex-to-llm-v0.1.0`
- `codex-to-llm-server-v0.1.0`

## First Publish

Neither package exists on npm yet, so each package needs one manual bootstrap publish before npm Trusted Publishing can be configured.

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

- run `npm run check`
- bump only the selected workspace version
- update the server's `@yadimon/codex-to-llm` dependency automatically when releasing core
- create a release commit
- create a package-specific Git tag
- push the commit and tag to `origin`

GitHub Actions publishes only the package that matches the pushed tag.

## Manual Equivalent

Core package:

```bash
npm run check
npm version patch --workspace @yadimon/codex-to-llm --no-git-tag-version
node -e "const fs=require('node:fs'); const p='packages/codex-to-llm-server/package.json'; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.dependencies['@yadimon/codex-to-llm']='^<version>'; fs.writeFileSync(p, JSON.stringify(pkg, null, 2)+'\n');"
git add package-lock.json packages/codex-to-llm/package.json packages/codex-to-llm-server/package.json
git commit -m "release(codex-to-llm): <version>"
git tag codex-to-llm-v<version>
git push origin HEAD --follow-tags
```

Server package:

```bash
npm run check
npm version patch --workspace @yadimon/codex-to-llm-server --no-git-tag-version
git add package-lock.json packages/codex-to-llm-server/package.json
git commit -m "release(codex-to-llm-server): <version>"
git tag codex-to-llm-server-v<version>
git push origin HEAD --follow-tags
```

## Notes

- `repository`, `homepage`, and `bugs` in both package manifests must match the canonical GitHub repository.
- `@yadimon/codex-to-llm-server` depends on `@yadimon/codex-to-llm`; core releases update that dependency range automatically.
- The publish workflow verifies that the pushed tag matches the target package version exactly.
