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

echo "[backup] uploads tar (частями по 40MB — лимит одного файла на free-тарифе Supabase)…"
docker run --rm --volumes-from triptrek-app \
  -v "$BACKUP_DIR":/backup alpine \
  sh -c "tar czf - -C /app/public uploads | split -b 40m - /backup/uploads-$STAMP.tar.gz.part-"

# Ротация ДО загрузки — иначе на 8-й день загрузка нового архива упирается
# в потолок free-квоты 1GB, падает по set -e до чистки и бэкап ломается
# навсегда. 6 дней: стабильно ~0.8GB из 1GB, запас на рост фото.
find "$BACKUP_DIR" -type f -mtime +6 -delete
rclone delete --min-age 6d "$REMOTE:postgres/"
rclone delete --min-age 6d "$REMOTE:uploads/"

echo "[backup] rclone → $REMOTE…"
rclone copy "$BACKUP_DIR/db-$STAMP.sql.gz" "$REMOTE:postgres/"
for part in "$BACKUP_DIR"/uploads-$STAMP.tar.gz.part-*; do
  # защита от пустого glob, если uploads вдруг пуст
  [ -e "$part" ] || continue
  rclone copy "$part" "$REMOTE:uploads/"
done

echo "[backup] done: db-$STAMP.sql.gz + uploads-$STAMP.tar.gz"
