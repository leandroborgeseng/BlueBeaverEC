# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# Mantém o workspace pnpm válido (apps/*) sem copiar o web inteiro
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm --filter @aion/shared build
WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm exec nest build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate \
  && apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY start-api.mjs /app/start-api.mjs
WORKDIR /app/apps/api
# Cópia fora de /app: bind-mount do volume no cwd esconde o dist da imagem.
ENV AION_API_ROOT=/app/apps/api
ENV AION_ROOT=/app
ENV LISTEN_HOST=0.0.0.0
RUN mkdir -p /opt/aion-dist /opt/aion-boot \
  && cp -a dist/. /opt/aion-dist/ \
  && cp scripts/start-prod.mjs /opt/aion-boot/start-prod.mjs \
  && cp start-api.mjs /opt/aion-boot/start-api.mjs
EXPOSE 3001
CMD ["node", "/opt/aion-boot/start-api.mjs"]
