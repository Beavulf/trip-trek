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
#            (опц.) VAPID_* (npx web-push generate-vapid-keys), OPENAI_API_KEY,
#            NEXT_PUBLIC_YANDEX_METRIKA_ID (номер счётчика Метрики; без переменной
#            метрика не подключается). Читается в рантайме серверными компонентами
#            (/landing и layout /login, оба dynamic), поэтому пересборка образа не
#            нужна: достаточно прописать в .env и перезапустить контейнер
#            (docker compose up -d). Цель регистрации — JS-событие `signup`
#            (в интерфейсе Метрики: Цели → JavaScript-событие → идентификатор signup)
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

- Сброс пароля — вручную владельцем (UPDATE user через psql; ADR-0007).
- Push без VAPID-ключей молча отключён.
- Один инстанс: in-memory rate-limit и WS-комнат достаточно до ~500 юзеров;
  горизонтальное масштабирование потребует Redis (швы оставлены).
- Фото живут на диске VPS: следить за `df -h`; лимиты загрузок (20 фото/час)
  сдерживают рост.

## 7. Гарантии безопасности деплоя (hardening 2026-09-12)

- **`:3000` наружу не публикуется никогда.** IP-лимитеры доверяют первому
  `X-Forwarded-For`, который перезаписывает только Caddy; прямой доступ к app
  делает IP-лимиты (логин 20/15мин) обходными. compose.smoke публикует порт только
  на `127.0.0.1`. Firewall: только 22/80/443 (ufw).
- **NEXTAUTH_SECRET** — только `openssl rand -base64 32` (start.sh без openssl
  падает, фолбэков нет); entrypoint не стартует с префиксами
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
