# ============================================
# TripTrek — Dockerfile (Production)
# ============================================
# Многоэтапная сборка: install → build → production
# ============================================

# --- Этап 1: Установка зависимостей ---
FROM oven/bun:1.1 AS deps
WORKDIR /app

# Копируем package.json и lock файл
COPY package.json bun.lockb* yarn.lock* package-lock.json* ./

# Устанавливаем зависимости
RUN bun install --frozen-lockfile || bun install

# --- Этап 2: Сборка ---
FROM oven/bun:1.1 AS builder
WORKDIR /app

# Копируем зависимости из deps
COPY --from=deps /app/node_modules ./node_modules

# Копируем исходники
COPY . .

# Генерируем Prisma клиент
RUN bunx prisma generate

# Пушим схему в БД (создаст файл при первом запуске)
RUN mkdir -p /app/data
RUN bunx prisma db push --skip-generate || true

# Собираем Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# --- Этап 3: Production ---
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Устанавливаем только production зависимости
COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile || bun install --production

# Копируем собранное приложение
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Создаём директории для данных
RUN mkdir -p /app/data /app/public/uploads/avatars

# Экспонируем порт
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1

# Запускаем server.ts (Next.js + WebSocket + Push)
CMD ["bun", "server.ts"]
