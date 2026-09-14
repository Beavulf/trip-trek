# TripTrek — runbook деплоя

Стек: один VPS, `docker compose` (app + Postgres + Caddy), хранилище локальное
(фото на томе `triptrek-uploads`), TLS от Let's Encrypt через Caddy.
Рассчитано на 100–200 пользователей. ADR: `docs/adr/0001`, `0002`, `0003` (с
поправкой на локальный диск), `0006`, `0008`.

## 0. Предусловия (один раз)

- VPS: 2 vCPU / 4 GB RAM / 40+ GB диска (Ubuntu 22.04+), root-доступ по SSH-ключу.
- Домен с A-записью → IP сервера (пока DNS-only / серое облако, если Cloudflare).
- На хосте: `docker`, `docker compose`, `rclone` (для бэкапов), `curl`.
- Клон репозитория: `git clone https://github.com/Beavulf/trip-trek.git && cd trip-trek`.

Firewall (только 22/80/443 наружу; app и db не светим):

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

rclone — внешний bucket для бэкапов (любой S3-совместимый: R2, Selectel, Яндекс…):

```bash
rclone config   # создать remote с именем triptrek-backup
```

## 1. Первый деплой

```bash
cd docker-deploy
cp .env.example .env
# заполнить: NEXTAUTH_SECRET (openssl rand -hex 32), POSTGRES_PASSWORD (openssl rand -hex 16),
#            DOMAIN, ACME_EMAIL, NEXTAUTH_URL=https://<домен>, WS_ALLOWED_ORIGINS=https://<домен>,
#            (опц.) VAPID_* (npx web-push generate-vapid-keys), OPENAI_API_KEY
docker compose up -d --build
```

Что происходит: поднимается Postgres → app ждёт БД, применяет миграции
(`prisma migrate deploy`), стартует bun-сервер → Caddy получает сертификат и
пускает трафик `https://<домен>` → app:3000.

Проверка (чеклист после деплоя):

```bash
curl -fsS https://<домен>/api/health        # {"status":"ok","db":"up"}
docker compose ps                           # все Up (healthy)
docker compose logs app --tail=50           # нет ошибок, есть "migrate deploy"
```

Затем в браузере: регистрация → создание поездки → загрузка фото → (с второго
устройства) вход по инвайт-коду и живое обновление галереи.

## 2. Перенос данных владельца (SQLite → Postgres, один раз)

Переносит аккаунт и поездку «Китай» со старой dev-базы (файл `prisma/db/dev.db`
на машине разработки) вместе с файлами фото:

```bash
# на машине разработки: упаковать базу и фото
tar czf triptrek-data.tgz prisma/db/dev.db public/uploads

# на VPS (в корне клона репозитория)
scp triptrek-data.tag user@vps:~/     # с машины разработки

cd ~/trip-trek && tar xzf ~/triptrek-data.tgz
docker compose -f docker-deploy/docker-compose.yml cp ~/triptrek/prisma/db/dev.db app:/app/dev.db 2>/dev/null || \
  docker cp prisma/db/dev.db triptrek-app:/app/dev.db
docker cp public/uploads/. triptrek-app:/app/public/uploads/

# залить данные в Postgres (id сохраняются; скрипт откажется, если БД не пуста)
docker exec -e SQLITE_PATH=/app/dev.db \
  -e DATABASE_URL="postgresql://triptrek:${POSTGRES_PASSWORD}@db:5432/triptrek?schema=public" \
  triptrek-app bun prisma/migrate-data.mjs

docker exec triptrek-app rm /app/dev.db   # чистим за собой
```

Вход: `worldofpolotsk@gmail.com` (пароль у владельца). Поездка «TripTrek: China
2024» появится в списке сразу.

## 3. Обновление (релиз новой версии)

```bash
cd ~/trip-trek && git pull
docker compose -f docker-deploy/docker-compose.yml up -d --build
```

Миграции применяются entrypoint'ом автоматически. Данные и фото на именованных
томах — `down/up` их не трогает (проверено критерием Phase 3/5).

Откат: `git checkout <предыдущий тег> && docker compose ... up -d --build`.
Миграции назад не откатываются автоматически — пишем только совместимые
миграции (additive-first).

Если `up --build` поднял контейнер, но он циклится с `P3009` в логах — упавшая
миграция записана в `_prisma_migrations` и блокирует остальные. Лечение: прочитать
ошибку миграции в логах, довести схему до её конечного состояния руками
(`docker exec triptrek-db psql -U triptrek -d triptrek ...`) и пометить применённой:
`docker exec triptrek-app bunx prisma migrate resolve --applied <имя>`, затем
перезапустить контейнер. Реальный случай: `20260912140000_expense_settlementkey_composite`
падала, потому что init-миграция создаёт уник как голый INDEX, а не CONSTRAINT
(починено в самой миграции, commit 162c706).

## 4. Бэкапы

`backup.sh` сохраняет дамп Postgres + архив uploads и отправляет наружу через
rclone; локальные копии живут 7 дней, в bucket 30 дней.

Cron на хосте (ночь, 04:00):

```bash
crontab -e
0 4 * * * /root/trip-trek/docker-deploy/backup.sh >> /var/log/triptrek-backup.log 2>&1
```

### Учения по восстановлению (провести один раз и после любых крупных изменений схемы)

```bash
# 1. свежая БД в отдельном контейнере
docker run -d --name restore-drill -e POSTGRES_PASSWORD=dev -p 5433:5432 postgres:16-alpine

# 2. развернуть последний дамп
docker exec -i restore-drill psql -U postgres -c "CREATE DATABASE triptrek"
gunzip -c /var/backups/triptrek/db-<СТАМП>.sql.gz | docker exec -i restore-drill psql -U postgres -d triptrek

# 3. проверить счётчики
docker exec restore-drill psql -U postgres -d triptrek -c "SELECT (SELECT count(*) FROM \"User\") users, (SELECT count(*) FROM \"Trip\") trips, (SELECT count(*) FROM \"Photo\") photos"

# 4. распаковать uploads-архив и убедиться, что имена файлов совпадают с url в БД
tar tzf /var/backups/triptrek/uploads-<СТАМП>.tar.gz | head

docker rm -f restore-drill
```

Восстановление в бой: поднять стек со свежим томом, применить дамп шагом 2
в сервис `db`, вернуть uploads-архив в том `triptrek-uploads`, перезапустить app.

## 5. Наблюдаемость и действия при инцидентах

```bash
docker compose -f docker-deploy/docker-compose.yml logs -f app    # логи приложения (JSON в проде)
docker compose ... logs -f caddy                                  # доступ + TLS
docker compose ... ps                                             # healthchecks
curl -s https://<домен>/api/health                                # db up/down
```

- БД упала → app отвечает 503 на /api/health, Caddy отдаёт 502/503 — чинить
  `docker compose logs db`, поднять `docker compose up -d db`.
- Забыли NEXTAUTH_SECRET → app не стартует с явным FATAL в логах.
- Миграция не применяется → `docker compose logs app | grep prisma`, чинить
  migration, повторный `up -d` перезапустит entrypoint.
- Назначить админа (доступ к `/admin`): зарегистрироваться в приложении, затем
  `docker compose exec app bun prisma/set-admin.mjs <email>` (локально:
  `npm run db:admin -- <email>`). Роль проверяется на сервере при каждом запросе —
  повторный вход не нужен.

## 6. Известные ограничения (осознанные решения)

- Сброс пароля — вручную владельцем (UPDATE user через psql; ADR-0007).
- Push без VAPID-ключей молча отключён.
- Один инстанс: in-memory rate-limit и WS-комнат достаточно до ~500 юзеров;
  горизонтальное масштабирование потребует Redis (швы оставлены).
- Фото живут на диске VPS: следить за `df -h`; лимиты загрузок (20 фото/час)
  сдерживают рост.

## 7. Гарантии безопасности деплоя (hardening 2026-09-12)

- **`:3000` наружу не публикуется никогда.** IP-лимитеры доверяют первому
  `X-Forwarded-For`, который перезаписывает только Caddy; прямой доступ к app
  делает лимиты (логин 5/15мин) обходными. compose.smoke публикует порт только
  на `127.0.0.1`. Firewall: только 22/80/443 (ufw).
- **NEXTAUTH_SECRET** — только `openssl rand -base64 32` (start.sh без openssl
  падает, фолбэков нет); entrypoint не стартует с префиксами
  `change-this-*`/`change-me-*` и `fallback-dev-secret`.
- **WS_ALLOWED_ORIGINS=https://<домен>** обязателен (дефолт в коде — `*`,
  реальную защиту несёт JWT-handshake, но явный origin лишним не бывает).
- **Railway/альтернативный деплой** (railway.toml): обязательно прикрепить
  volume к `/app/public/uploads` (или задать `UPLOADS_DIR`) — без volume
  redeploy теряет все загруженные файлы при живых записях в БД; также помнить,
  что Caddy там отсутствует — см. первый пункт про XFF.
- Docker-образ не содержит локальных артефактов: `.dockerignore` исключает
  `prisma/db` (реальная dev-БД владельца), `*.db`, `.env*`.
