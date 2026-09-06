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

echo "[triptrek] prisma generate + db push…"
bunx prisma generate
bunx prisma db push --skip-generate --accept-data-loss

echo "[triptrek] starting server on 0.0.0.0:${PORT:-3000}…"
exec "$@"
