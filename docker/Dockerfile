# syntax=docker/dockerfile:1.7
# Build multi-stage do monorepo Somar: imagens "web" (Next.js standalone) e "worker" (+ bootstrap de migrations).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# --- dependências (camada em cache enquanto o lockfile não mudar) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/tax-engine/package.json packages/tax-engine/
COPY packages/ai/package.json packages/ai/
COPY fixtures/package.json fixtures/
# Secret opcional "extra_ca": CA adicional para builds atrás de um proxy corporativo
# (docker build --secret id=extra_ca,src=/caminho/ca.crt ...). Não fica na imagem.
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @somar/web build && pnpm --filter @somar/worker build

# --- imagem web ---
FROM node:${NODE_VERSION} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S somar && adduser -S somar -G somar && mkdir -p /data/files && chown somar:somar /data/files
COPY --from=build --chown=somar:somar /repo/apps/web/.next/standalone ./
COPY --from=build --chown=somar:somar /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=somar:somar /repo/apps/web/public ./apps/web/public
USER somar
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]

# --- imagem worker (também usada pelo serviço "migrate") ---
FROM node:${NODE_VERSION} AS worker
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
WORKDIR /app
RUN addgroup -S somar && adduser -S somar -G somar && mkdir -p /data/files && chown somar:somar /data/files
COPY --from=build --chown=somar:somar /repo/apps/worker/dist ./
COPY --from=build --chown=somar:somar /repo/apps/worker/healthcheck.mjs ./
COPY --from=build --chown=somar:somar /repo/packages/db/migrations ./migrations
USER somar
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node healthcheck.mjs
CMD ["node", "index.js"]
