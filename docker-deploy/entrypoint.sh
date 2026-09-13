#!/bin/sh
set -e

# P0 #1: fail fast in production if NEXTAUTH_SECRET is missing or insecure.
# Сравнение по префиксам change-this-*/change-me-* закрывает и предсказуемый
# фолбэк start.sh (change-this-secret-<unix ts>), и placeholder из .env.example
# (аудит 2026-09-12)
if [ "$NODE_ENV" = "production" ]; then
  case "$NEXTAUTH_SECRET" in
    ""|"fallback-dev-secret"|change-this-*|change-me-*)
      echo "[triptrek] FATAL: NEXTAUTH_SECRET is not set or is an insecure default."
      echo "[triptrek] Generate a secure key with: openssl rand -hex 32"
      echo "[triptrek] and set it as NEXTAUTH_SECRET in your environment."
      exit 1
      ;;
  esac
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
