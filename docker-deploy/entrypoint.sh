#!/bin/sh
set -e

# P0 #1: fail fast in production if NEXTAUTH_SECRET is missing or insecure
if [ "$NODE_ENV" = "production" ]; then
  if [ -z "$NEXTAUTH_SECRET" ] || [ "$NEXTAUTH_SECRET" = "change-this-in-production" ] || [ "$NEXTAUTH_SECRET" = "fallback-dev-secret" ]; then
    echo "[triptrek] FATAL: NEXTAUTH_SECRET is not set or is an insecure default."
    echo "[triptrek] Generate a secure key with: openssl rand -hex 32"
    echo "[triptrek] and set it as NEXTAUTH_SECRET in your environment."
    exit 1
  fi
fi

echo "[triptrek] prisma generate…"
bunx prisma generate

# Ждём готовности Postgres: на первый запуск db может стартовать дольше app
echo "[triptrek] waiting for database…"
tries=0
until printf 'SELECT 1;' | bunx prisma db execute --stdin --schema prisma/schema.prisma > /dev/null 2>&1; do
  tries=$((tries+1))
  if [ "$tries" -ge 30 ]; then
    echo "[triptrek] FATAL: database not reachable after 60s — check db service/logs"
    exit 1
  fi
  sleep 2
done

# Схему применяют только миграции (ADR-0002): db push запрещён
echo "[triptrek] applying migrations…"
bunx prisma migrate deploy

echo "[triptrek] starting server on 0.0.0.0:${PORT:-3000}…"
exec "$@"
