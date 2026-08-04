# ============================================
# TripTrek — Production Dockerfile
# ============================================
# Многоэтапная сборка: deps → build → production
# ============================================

# --- Этап 1: Установка зависимостей ---
FROM oven/bun:1.1 AS deps
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

# --- Этап 2: Сборка ---
FROM oven/bun:1.1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Генерируем Prisma клиент
RUN bunx prisma generate

# Создаём директорию для БД и пушим схему
RUN mkdir -p /app/data
ENV DATABASE_URL=file:/app/data/triptrek.db
RUN bunx prisma db push --skip-generate

# Собираем Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx next build

# --- Этап 3: Production ---
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Копируем package.json и устанавливаем только production зависимости
COPY package.json bun.lockb* ./
RUN bun install --production

# Копируем собранное приложение
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Копируем файлы для custom server (WebSocket + Push)
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/hooks ./src/hooks
COPY --from=builder /app/src/app/api ./src/app/api

# Копируем конфиги
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Создаём директории для данных
RUN mkdir -p /app/data /app/public/uploads/avatars

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1

# Запускаем server.ts (Next.js + WebSocket + Push)
CMD ["bun", "server.ts"]
