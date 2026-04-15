# Contributing

## Setup

```bash
npm install
```

## Verification

Run the standard repository checks before opening a PR:

```bash
npm run check
```

For server container verification:

```bash
npm run test:docker
```

## Commit format

Use Conventional Commits, for example:

- `feat(core): add response runner option`
- `fix(server): bypass auth for health routes`
- `docs(repo): clarify release flow`

## Pull requests

- keep source changes and release/CI changes separate when practical
- include test evidence
- update docs when public behavior or release flow changes
