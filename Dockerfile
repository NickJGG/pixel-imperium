FROM node:24-slim AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/nonogram/package.json packages/nonogram/
COPY packages/protocol/package.json packages/protocol/

FROM base AS web
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @pixel-imperium/web...
COPY packages packages
COPY apps/web apps/web
RUN pnpm -F @pixel-imperium/web build

FROM base
COPY apps/server/package.json apps/server/
# Dev dependencies included: the server runs through tsx, and the release command through drizzle-kit.
RUN pnpm install --frozen-lockfile --filter @pixel-imperium/server...
COPY packages packages
COPY apps/server apps/server
COPY --from=web /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]
