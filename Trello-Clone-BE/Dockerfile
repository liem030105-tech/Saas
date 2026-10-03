# The API image (DEPLOYMENT-001, ADR-023): built from the repository root, which holds the pnpm
# workspace (`docker build -f Trello-Clone-BE/Dockerfile .`). Render runs it; CI builds and
# starts it on every PR (the `docker` job).
FROM node:24-slim AS base
# The Prisma CLI (migrations) needs OpenSSL, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first, so the dependency layer is reused until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY Trello-Clone-BE/package.json Trello-Clone-BE/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @trello-clone/api...
# The packages' tsconfigs extend the root one (Prisma reads it when loading prisma.config.ts).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY Trello-Clone-BE Trello-Clone-BE
RUN pnpm --filter @trello-clone/api db:generate && pnpm --filter @trello-clone/api build

FROM base AS runtime
ENV NODE_ENV=production
# The whole install is kept: the Prisma CLI (migrations before each deploy) and tsx (the seed)
# are dev dependencies.
COPY --from=build --chown=node:node /app /app
WORKDIR /app/Trello-Clone-BE
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Migrations first, then the server (one instance, so no two deploys migrate at once; ADR-023).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
