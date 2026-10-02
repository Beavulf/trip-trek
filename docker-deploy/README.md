# TripTrek — Production Docker

Прод-стек в docker compose. **Полный runbook — [DEPLOY.md](DEPLOY.md)**:
env-переменные, первый деплой, обновление, миграции, бэкапы и восстановление,
диагностика. Этот файл — только карта папки и ключевые факты.

## Стек (docker-compose.yml)

| Сервис | Контейнер | Что |
|---|---|---|
| `app` | `triptrek-app` | `bun server.ts`: Next.js 16 (standalone, **webpack**-сборка, не Turbopack) + socket.io + раздача `/uploads` |
| `db` | `triptrek-db` | **PostgreSQL 16** (не SQLite), данные в volume `triptrek-pgdata` |
| `caddy` | `triptrek-caddy` | TLS Let's Encrypt, порты 80/443 |

- Фото/аватары — volume `triptrek-uploads`, раздаются мимо Next
  (`server/static-uploads.ts`: том докера не попадает в standalone-сборку).
- Сеть `caddy-shared` (external `supabase-network`) закреплена за `app` — общая
  с соседним Caddy-прокси, который резолвит `triptrek-app` по имени контейнера;
  без неё сайт отдаёт 502 после каждого пересоздания контейнера (инцидент
  2026-09-16, подробности в комментарии compose и DEPLOY.md).

## Миграции

Применяяются при старте контейнера (`entrypoint.sh` → `prisma migrate deploy`).
Вручную: `docker exec triptrek-app bunx prisma migrate deploy`.
**Не** `prisma db push` — схема живёт в миграциях `prisma/migrations/`.

## Файлы

| Файл | Что |
|---|---|
| `docker-compose.yml` | прод-стек (app + db + caddy) |
| `Dockerfile` | трёхэтапная сборка образа |
| `entrypoint.sh` | миграции при старте → запуск сервера |
| `Caddyfile` | TLS и проксирование на `app:3000` |
| `.env.example` | шаблон секретов (NEXTAUTH_SECRET, POSTGRES_PASSWORD, DOMAIN, ACME_EMAIL, VAPID_\*, SMTP_\*…) |
| `backup.sh` | pg_dump + tar uploads → rclone оффсайт, ретеншн 7 дней |
| `compose.smoke.yml`, `docker-compose.local.yml` | smoke-проверка и локальные вариации стека |
