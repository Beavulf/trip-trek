#!/bin/sh
set -e

echo "[triptrek] prisma generate + db push…"
bunx prisma generate
bunx prisma db push --skip-generate --accept-data-loss

echo "[triptrek] starting server on 0.0.0.0:${PORT:-3000}…"
exec "$@"
