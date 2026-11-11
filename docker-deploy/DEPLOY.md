# TripTrek — runbook деплоя

Стек: один VPS, `docker compose` (app + Postgres + Caddy), хранилище локальное
(фото на томе `triptrek-uploads`), TLS от Let's Encrypt через Caddy.
Рассчитано на 100–200 пользователей. ADR: `docs/adr/0001`, `0002`, `0003` (с
поправкой на локальный диск), `0006`, `0008`.

## 0. Предусловия (один раз)

- VPS: 2 vCPU / 4 GB RAM / 40+ GB диска (Ubuntu 22.04+), root-доступ по SSH-ключу.
- Домен с A-записью → IP сервера (пока DNS-only / серое облако, если Cloudflare).
- На хосте: `docker`, `docker compose`, `rclone` (для бэкапов), `curl`.
- (Опционально, для писем сброса пароля): постфикс-релей на хосте, слушает :25 —
  compose добавляет `host.docker.internal` через `extra_hosts`. Без него приложение
  работает, но сброс пароля письмом (§1/§6) не отправится.
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
#            SMTP_* (для сброса пароля письмом — см. §0 и .env.example), LANDING_REDIRECT (опц.),
#            (опц.) VAPID_* (npx web-push generate-vapid-keys), OPENAI_API_KEY,
#            NEXT_PUBLIC_YANDEX_METRIKA_ID (номер счётчика Метрики; без переменной
#            метрика не подключается). Читается в рантайме серверными компонентами
#            (/landing и layout /login, оба dynamic), поэтому пересборка образа не
#            нужна: достаточно прописать в .env и перезапустить контейнер
#            (docker compose up -d). Цель регистрации — JS-событие `signup`
#            (в интерфейсе Метрики: Цели → JavaScript-событие → идентификатор signup)
docker compose up -d --build
```

**Два варианта TLS — определитесь ДО первого деплоя, не смешивайте:**

- **Встроенный `caddy` из этого compose** — путь по умолчанию: сам получает сертификат
  Let's Encrypt и слушает 80/443. `DOMAIN` и `ACME_EMAIL` обязательны именно для него.
- **Общий Caddy `guild-ledger`** (`/root/guild-ledger/Caddyfile`, upstream `triptrek-app:3000`)
  — как устроен боевой хост этого проекта (см. §3): TLS обслуживает общий прокси, app обязан
  сидеть в сети `supabase-network` (закреплено в compose). Встроенный caddy при этом лишний:
  порт 80/443 занят общим Caddy, и caddy-контейнер будет падать в restart-loop на биндинге —
  это ожидаемо, его можно игнорировать, пока TLS держит общий Caddy. Если ставите с нуля и
  хотите именно общий Caddy — поднимайте `app` и `db` без ожидания `caddy`
  (`docker compose up -d --build app db`) либо добавьте в свой compose `profiles` для сервиса
  caddy (в прод-файл не коммитим — это локальная поправка хоста).

Что происходит: поднимается Postgres → app ждёт БД, применяет миграции
(`prisma migrate deploy`), стартует bun-сервер → Caddy получает сертификат и
пускает трафик `https://<домен>` → app:3000.

Проверка (чеклист после деплоя):

```bash
curl -fsS https://<домен>/api/health        # {"status":"ok","db":"up"}
docker compose ps                           # все Up (healthy)
docker compose logs app --tail=50           # нет ошибок, есть "[triptrek] applying migrations…"
```

Затем в браузере: регистрация → создание поездки → загрузка фото → (с второго
устройства) вход по инвайт-коду и живое обновление галереи. Проверить сброс
пароля письмом (SMTP). При обновлении раздачи поднимать `CACHE_VERSION` в
`public/sw.js` — иначе клиенты останутся на старой версии PWA.

## 2. Перенос данных владельца (SQLite → Postgres, один раз)

Переносит аккаунт и поездку «Китай» со старой dev-базы (файл `prisma/db/dev.db`
на машине разработки) вместе с файлами фото:

```bash
# на машине разработки: упаковать базу и фото
tar czf triptrek-data.tgz prisma/db/dev.db public/uploads

# на VPS (в корне клона репозитория)
scp triptrek-data.tgz user@vps:~/     # с машины разработки

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

**Один раз после релиза, добавившего размеры фото** (`Photo.width/height`): у уже
загруженных снимков их нет, и галерея с публичной страницей строят плитки без
`aspect-ratio` (колонки прыгают, лишние картинки тянутся заранее). Скрипт дописывает
размеры и недостающие миниатюры у старых снимков; ничего не удаляет, оригиналы не
трогает, повторный запуск безопасен:

```bash
docker exec triptrek-app bun prisma/backfill-photos.ts          # сухой прогон: только отчёт
docker exec triptrek-app bun prisma/backfill-photos.ts --apply  # записать
# порциями, если снимков тысячи: --apply --limit=200
```

TLS и 80/443 обслуживает ОБЩИЙ Caddy guild-ledger (`/root/guild-ledger/Caddyfile`,
upstream `triptrek-app:3000` по имени). Поэтому app обязан быть прикреплён к сети
`supabase-network` — это закреплено в compose (`networks: caddy-shared` для app).
Признак того, что связь потерялась: приложение healthy, `/api/health` внутри
контейнера 200, а снаружи 502 и в логах Caddy `lookup triptrek-app: i/o timeout`.
Лечение разово: `docker network connect supabase-network triptrek-app`.

### Гигиена диска: кэш сборок Docker

Каждый `up -d --build` дописывает записи в build cache; на этом хосте Docker работает
через containerd-хранилище, поэтому кэш лежит в `/var/lib/containerd`, а не в
`/var/lib/docker`. Авточистки у Docker на Linux-сервере нет — раз в неделю её делает
крон на хосте (инцидент 2026-11-11: кэш дорос до 46 GB из 66 занятых, почистили до 25):

```bash
crontab -e
0 5 * * 1 docker builder prune -a -f --reserved-space 5G >> /var/log/triptrek-docker-prune.log 2>&1
0 5 * * 1 docker image prune -f >> /var/log/triptrek-docker-prune.log 2>&1
```

`--reserved-space 5G` оставляет кэш последней сборки, остальное сносит; образы,
контейнеры и тома prune не трогает — единственный эффект, следующий деплой собирается
с нуля (дольше). Проверить вручную, сколько занято и сколько можно освободить:
`docker builder du` (строки Reclaimable/Total).

### Техработы: предупредить, закрыть вход, выкатить

Всё из админки (Админка → Настройки → «Техработы и объявление»), без правок на сервере:

1. **За 15–30 минут** — «Объявление для всех» → «Опубликовать»: баннер появится у всех открытых
   вкладок в течение минуты (закрывается крестиком до конца сессии).
2. **Перед выкатом** — включить «Режим техработ». Не-админы сразу получают 503 + заглушку
   (страницы и `/api/*`), вход закрыт (`custom-login` пускает только админа; пароль проверяется
   до отказа, чтобы не светить, чей email есть в базе). Админ продолжает работать — можно
   проверить релиз на живых данных до того, как открыть его всем.
3. Выкат: `git pull && docker compose -f docker-deploy/docker-compose.yml up -d --build`.
   Пока контейнер пересоздаётся, заглушку показывает уже Caddy (см. ниже), открытые вкладки
   опрашивают `/api/app-status` раз в 15 секунд и **сами перезагружаются**, когда режим выключен.
4. Проверка: `curl -fsS https://<домен>/api/health`, зайти админом → выключить режим → убрать объявление.

Механика: `server/maintenance-gate.ts` стоит в `server.ts` перед Next; состояние кэшируется на 3 с
(`src/lib/maintenance-state.ts`), сохранение в админке сбрасывает кэш сразу. Всегда открыты:
`/api/health`, `/api/app-status`, `/login`, `custom-login`/`custom-signout`, `/_next`, файлы с расширением
(sw.js, иконки), `/landing`, `/privacy` (список — `isMaintenanceExempt`, покрыт тестом). Если сам
сервер не поднялся, а режим забыт включённым — выключить без админки:

```bash
docker exec triptrek-db psql -U triptrek -d triptrek -c "UPDATE \"AppSettings\" SET \"maintenanceMode\" = false WHERE id = 'app'"
```

(через ≤3 секунды гейт это подхватит). WebSocket-соединения уже вошедших не рвутся — канал read-only,
данных они не получают без HTTP-запросов, которые закрыты.

**Заглушка на время рестарта контейнера (Caddy).** Пока `app` недоступен, Caddy отдаёт голый 502.
Добавь в блок сайта TripTrek в Caddyfile (в проде — общий `/root/guild-ledger/Caddyfile`; правка на
сервере, `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`). 503 самого приложения
(режим техработ) этот блок не затрагивает — только ошибки соединения с upstream:

```caddy
	handle_errors {
		@down expression {err.status_code} in [502, 503, 504]
		handle @down {
			header Content-Type "text/html; charset=utf-8"
			header Retry-After "30"
			header Cache-Control "no-store"
			respond `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>Технические работы — TripTrek</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0b1220;color:#e8edf7;font-family:system-ui,sans-serif;text-align:center;padding:24px}p{color:#a9b4c9;max-width:420px;line-height:1.55}</style></head><body><main><div style="font-size:48px">🛠️</div><h1>Технические работы</h1><p>Обновляем TripTrek — вернёмся через пару минут. Страница обновится сама.</p></main></body></html>` 503
		}
	}
```

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
rclone; копии (локальные и в bucket) живут 7 дней — размер подобран под free-тариф
Supabase Storage (1 GB, ~150 МБ/день). Читает env `BACKUP_DIR`
(дефолт `/var/backups/triptrek`) и `RCLONE_REMOTE` (дефолт `triptrek-backup`) —
задаются на хосте при необходимости другого пути/remote.

Remote `triptrek-backup` — облачный Supabase Storage, S3-совместимый endpoint (выбран
2026-11; self-hosted MinIO на том же VPS не годится — тот же диск и та же точка отказа).
В rclone `remote:путь` первая часть пути — имя bucket'а, поэтому `backup.sh` ждёт
ДВА приватных bucket'а с точными именами `postgres` и `uploads` (а не один общий):

```bash
# В Supabase: Storage → New bucket → `postgres` (Private) и `uploads` (Private);
# Storage → Settings → S3 access keys → создать пару ключей. Затем на хосте:
rclone config create triptrek-backup s3 \
  provider=Other \
  endpoint=https://<PROJECT_REF>.supabase.co/storage/v1/s3 \
  region=<РЕГИОН_ПРОЕКТА> \
  access_key_id=<KEY> secret_access_key=<SECRET> \
  force_path_style=true no_check_bucket=true acl=private
chmod 600 /root/.config/rclone/rclone.conf
```

Регион — регион проекта из Project Settings → General (у этого проекта он оказался
неочевидный `eu-north-1`, Стокгольм): с неверным регионом шлюз отвечает
`403 Forbidden`. Отдельный грабль: `NoSuchBucket` — нет bucket'а с таким именем;
проверка bucket'а идёт ДО проверки подписи, поэтому NoSuchBucket не означает,
что ключи или регион правильные. Bucket'ы можно создавать и без дашборда,
REST'ом с ключом `sb_secret_…`: `POST /storage/v1/bucket` с `{"name":…,"public":false}`.

Cron на хосте (ночь, 04:00):

```bash
crontab -e
0 4 * * * /root/trip-trek/docker-deploy/backup.sh >> /var/log/triptrek-backup.log 2>&1
```

Путь к клону на боевом хосте другой: `/opt/trip-trek` (проверка: `docker inspect
triptrek-app --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`)
— в cron подставляйте фактический путь. 2026-11-11: на боевом хосте крон бэкапа не был
установлен вовсе (backup.sh на месте, лога `/var/log/triptrek-backup.log` нет) — после
настройки rclone-remote не забудьте добавить строку в crontab.

### Учения по восстановлению (провести один раз и после любых крупных изменений схемы)

```bash
# 1. свежая БД в отдельном контейнере
docker run -d --name restore-drill -e POSTGRES_PASSWORD=dev -p 5433:5432 postgres:16-alpine

# 2. развернуть последний дамп
docker exec -i restore-drill psql -U postgres -c "CREATE DATABASE triptrek"
gunzip -c /var/backups/triptrek/db-<СТАМП>.sql.gz | docker exec -i restore-drill psql -U postgres -d triptrek

# 3. проверить счётчики
docker exec restore-drill psql -U postgres -d triptrek -c "SELECT (SELECT count(*) FROM \"User\") users, (SELECT count(*) FROM \"Trip\") trips, (SELECT count(*) FROM \"Photo\") photos"

# 4. распаковать uploads-архив (лежит частями .part-aa, .part-ab, … — лимит файла
#    на free-тарифе Supabase) и убедиться, что имена файлов совпадают с url в БД
cat /var/backups/triptrek/uploads-<СТАМП>.tar.gz.part-* | tar tzf - | head

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
  `docker compose -f docker-deploy/docker-compose.yml logs db`, поднять `docker compose -f docker-deploy/docker-compose.yml up -d db`.
- Забыли NEXTAUTH_SECRET → app не стартует с явным FATAL в логах.
- Миграция не применяется → `docker compose -f docker-deploy/docker-compose.yml logs app | grep prisma`, чинить
  migration, повторный `up -d` перезапустит entrypoint.
- `bun install` в билде падает `Fail extracting tarball for "next"` →
  прямой registry.npmjs.org с VPS рвётся в bun на длинных загрузках (curl
  при этом проходит; аудит деплоя 2026-10-06). В Dockerfile установки уже
  идут через зеркало `registry.npmmirror.com` (целостность гарантируют
  чек-суммы из bun.lock) с общим BuildKit-кэшем и сериализованы между
  стадиями. Если проблема вернётся — сменить зеркало (`--registry
  https://registry.yarnpkg.com`) и/или добавить retry-цикл вокруг install.
- Назначить админа (доступ к `/admin`): зарегистрироваться в приложении, затем
  `docker compose exec app bun prisma/set-admin.mjs <email>` (локально:
  `npm run db:admin -- <email>`). Роль проверяется на сервере при каждом запросе —
  повторный вход не нужен.

## 6. Известные ограничения (осознанные решения)

- Сброс пароля — самосервис по письму: `/api/auth/forgot-password` (sha256-хеш в БД, TTL 60 мин), отправка через nodemailer → постфикс-релей на хосте (compose прокидывает `host.docker.internal`). ADR-0007 с поправкой 2026-10-22. Ручной SQL-сброс (`UPDATE "User"` в psql) — только когда почта не настроена.
- Push без VAPID-ключей молча отключён.
- Один инстанс: in-memory rate-limit и WS-комнат достаточно до ~500 юзеров;
  горизонтальное масштабирование потребует Redis (швы оставлены).
- Фото живут на диске VPS: следить за `df -h`; лимиты загрузок (500 фото / ч / user
  в `src/app/api/photos/route.ts`, плюс потолок `PHOTO_LIMIT_PER_TRIP` = 1500 и
  20MB на файл) сдерживают рост.

## 7. Гарантии безопасности деплоя (hardening 2026-09-12)

- **`:3000` наружу не публикуется никогда.** IP-лимитеры доверяют первому
  `X-Forwarded-For`, который перезаписывает только Caddy; прямой доступ к app
  делает IP-лимиты (логин 20/15мин) обходными. compose.smoke публикует порт только
  на `127.0.0.1`. Firewall: только 22/80/443 (ufw).
- **NEXTAUTH_SECRET** — `openssl rand -base64 32` или `openssl rand -hex 32` (оба 256 бит;
  start.sh падает без openssl, фолбэков нет); entrypoint не стартует с префиксами
  `change-this-*`/`change-me-*` и `fallback-dev-secret`.
- **WS_ALLOWED_ORIGINS=https://<домен>** рекомендуется (с 2026-10-02 дефолт в
  коде — origin из NEXTAUTH_URL, явный `*` остался ручным выбором; реальную
  защиту несёт JWT-handshake, но явный origin лишним не бывает).
- **Railway/альтернативный деплой** (railway.toml): обязательно прикрепить
  volume к `/app/public/uploads` (или задать `UPLOADS_DIR`) — без volume
  redeploy теряет все загруженные файлы при живых записях в БД; также помнить,
  что Caddy там отсутствует — см. первый пункт про XFF.
- Docker-образ не содержит локальных артефактов: `.dockerignore` исключает
  `prisma/db` (реальная dev-БД владельца), `*.db`, `.env*`.
