FROM node:22-bookworm-slim AS build

ARG CODEX_CLI_PACKAGE=@openai/codex
WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY tsconfig.json ./tsconfig.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY scripts ./scripts
COPY packages ./packages

RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim

ARG CODEX_CLI_PACKAGE=@openai/codex
ENV NODE_ENV=production
ENV CODEX_TO_LLM_SERVER_HOST=0.0.0.0
ENV CODEX_TO_LLM_SERVER_PORT=3000
WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY packages/codex-to-llm/package.json ./packages/codex-to-llm/package.json
COPY packages/codex-to-llm/README.md ./packages/codex-to-llm/README.md
COPY packages/codex-to-llm/LICENSE ./packages/codex-to-llm/LICENSE
COPY packages/codex-to-llm/scripts ./packages/codex-to-llm/scripts
COPY packages/codex-to-llm-server/package.json ./packages/codex-to-llm-server/package.json
COPY packages/codex-to-llm-server/README.md ./packages/codex-to-llm-server/README.md
COPY packages/codex-to-llm-server/LICENSE ./packages/codex-to-llm-server/LICENSE
COPY packages/codex-to-llm-server/Dockerfile ./packages/codex-to-llm-server/Dockerfile
COPY packages/codex-to-llm-server/scripts ./packages/codex-to-llm-server/scripts

RUN npm ci --omit=dev --workspaces --include-workspace-root false
RUN npm install -g ${CODEX_CLI_PACKAGE}

COPY --from=build /app/packages/codex-to-llm/dist ./packages/codex-to-llm/dist
COPY --from=build /app/packages/codex-to-llm-server/dist ./packages/codex-to-llm-server/dist

EXPOSE 3000

CMD ["node", "./packages/codex-to-llm-server/dist/cli.js"]
