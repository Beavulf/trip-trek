# TripTrek — Production Dockerfile
# Build context: repo root (docker-compose context: ..)
# Multi-stage: deps → build → runner (non-root)

FROM oven/bun:1.3.14-debian AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-debian AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Для generate достаточно любого валидного URL — на билд-стадии БД не нужна
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN bunx prisma generate
# --webpack: turbopack-билд падает под Linux (resolve 'tw-animate-css', Next 16),
# а server.ts всё равно запускает runtime на webpack (webpack: true) — собираем тем же
RUN bunx next build --webpack

FROM oven/bun:1.3.14-debian AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# DATABASE_URL задаёт docker-compose (Postgres сервиса db)

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Non-root: образ oven/bun включает пользователя bun
RUN mkdir -p /app/public/uploads/avatars /app/public/uploads/foods \
  && chown -R bun:bun /app
USER bun

COPY --chown=bun:bun docker-deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "server.ts"]
