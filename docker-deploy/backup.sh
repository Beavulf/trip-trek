#!/bin/sh
# TripTrek — ночной бэкап (запускается cron'ом на хосте, см. DEPLOY.md).
# Хранилище локальное (ADR-0003-amended), поэтому бэкапим ДВЕ вещи:
#   1) дамп Postgres            (docker exec pg_dump)
#   2) архив /app/public/uploads (том triptrek-uploads: фото/аватары/блюда)
# И отправляем их наружу через rclone (внешний S3-совместимый bucket).
#
# Требования на хосте: rclone с настроенным remote `triptrek-backup`.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/triptrek}"
REMOTE="${RCLONE_REMOTE:-triptrek-backup}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$BACKUP_DIR"

echo "[backup] pg_dump…"
docker exec triptrek-db pg_dump -U triptrek triptrek | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[backup] uploads tar…"
docker run --rm --volumes-from triptrek-app \
  -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz" -C /app/public uploads

echo "[backup] rclone → $REMOTE…"
rclone copy "$BACKUP_DIR/db-$STAMP.sql.gz" "$REMOTE:postgres/"
rclone copy "$BACKUP_DIR/uploads-$STAMP.tar.gz" "$REMOTE:uploads/"

# Ротация: локально 7 дней, в bucket 30 дней
find "$BACKUP_DIR" -type f -mtime +7 -delete
rclone delete --min-age 30d "$REMOTE:postgres/"
rclone delete --min-age 30d "$REMOTE:uploads/"

echo "[backup] done: db-$STAMP.sql.gz + uploads-$STAMP.tar.gz"
