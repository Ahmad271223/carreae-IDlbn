# syntax=docker/dockerfile:1
# ---------- Build: full monorepo, then an isolated production bundle ----------
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Prisma client types must exist before the TypeScript build.
RUN pnpm --filter @careerid/api exec prisma generate
# Builds @careerid/api plus its workspace dependencies (branding/shared/i18n/templates).
RUN pnpm --filter @careerid/api... build
# Self-contained production dir: package files + prod node_modules incl. workspace deps.
RUN pnpm --filter @careerid/api --prod deploy /prod/api

# ---------- Runtime: Playwright base ships Node + Chromium + all OS deps ----------
# Version MUST match the playwright dependency in apps/api/package.json.
FROM mcr.microsoft.com/playwright:v1.62.1-noble
ENV NODE_ENV=production \
    CHROMIUM_NO_SANDBOX=1 \
    PORT=3001
WORKDIR /app
COPY --from=build /prod/api ./
# Prisma client for the runtime platform.
RUN npx prisma generate
EXPOSE 3001
# Migrations run on boot — deploys are one step (DEPLOYMENT.md).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
