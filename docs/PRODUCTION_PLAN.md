# План вывода TripTrek в продакшен

Утверждён 2026-09-09 (grilling-сессия с владельцем). Ключевые решения — в `docs/adr/0001…0008`.
Аудитория документа: ИИ-агенты, выполняющие фазы по очереди.

> **Статус исполнения (2026-09-10):** Phase 0 ✅ (5fc0d3d) · Phase 1 ✅ (11b4d74) ·
> Phase 2 ✅ с поправкой владельца «хранилище = локальный диск, без S3» (546ea71,
> ADR-0003 amended) · Phase 3 ✅ (747f51d) · Phase 4 ✅ (70e7349) · Phase 5 ✅
> (Caddy+backup+DEPLOY.md; e2e-смоук в docker-deploy/compose.smoke.yml).
> Phase 6 (мобильный полиш) — после запуска. Реализацию вёл ZCode по этому плану.

## Контекст

- Стек: Next.js 16 App Router + custom `server.ts` (bun) с socket.io, Prisma 6, NextAuth v4 (JWT 30d), sharp, web-push.
- Цель: публичный интернет, до ~500 активных пользователей, **один VPS-инстанс**.
- 99% пользователей — телефон. Гео — СНГ; хостинг Hetzner, если оплатить получится, иначе провайдер из РФ/РБ (VPS.by / Timeweb / Selectel). Всё провайдер-зависимое — env-переменные.
- Прод стартует с **пустой базой**; текущая dev-база не переносится (при желании — через `/api/trip/export` → `/api/trip/import`).

## Правила для агентов

1. Не начинать фазу, пока рабочее дерево не чистое (текущие редизайны коммитит владелец отдельно).
2. Фазы выполнять по порядку — есть зависимости (Phase 2 → 4, Phase 3 → 5).
3. Одна фаза = один набор коммитов; фаза считается законченной, только когда выполнены **все** пункты Acceptance.
4. Не расширять скоуп: пункт из раздела «Отложено» не делать.
5. Изменения серверных модулей (`server/`, `src/lib/`) проверять и в dev (`bun run dev:all`), и сборкой (`next build`) — `ignoreBuildErrors` снимается в Phase 4.

## Зафиксированные решения

| Решение | ADR |
|---|---|
| Один VPS + Docker Compose (app + Postgres), швы под Redis/S3, без их включения | [0001](adr/0001-single-vps-docker.md) |
| Postgres + `prisma migrate`, `db push --accept-data-loss` запрещён | [0002](adr/0002-postgres-migrations.md) |
| Хранилище: **локальный диск в контейнере** (изменено владельцем 2026-09-10, было «S3 с первого дня»); единый storage-модуль с политикой; EXIF-strip на сервере | [0003](adr/0003-object-storage.md) |
| Realtime: JWT на handshake, `publish(tripId, event)`, сокет только читает | [0004](adr/0004-realtime-auth.md) |
| Rate limiting: один модуль, in-memory store, Redis-adapter позже | [0005](adr/0005-rate-limit.md) |
| Бэкапы: ночной `pg_dump` во внешний bucket + учения по восстановлению | [0006](adr/0006-backups.md) |
| Auth: e-mail+пароль, без SMTP/OAuth на запуск; сброс пароля вручную владельцем | [0007](adr/0007-auth-scope.md) |
| Деплой: `git pull && docker compose up -d --build`; наблюдаемость — минимум | [0008](adr/0008-deploy-observability.md) |

---

## Phase 0 — Быстрые фиксы (блокеры без рефакторинга)

**Цель:** закрыть дешёвые дыры и снять множители нагрузки до больших работ.

**Файлы:** `src/components/providers.tsx`, `src/app/api/test-auth/route.ts`, `src/app/api/route.ts`, `src/app/api/trips/join/route.ts`, `server.ts`, `src/lib/db.ts`, `docker-compose.yml` (корневой), `Dockerfile` (корневой).

**Шаги:**
1. `providers.tsx`: убрать глобальный `refetchInterval: 30_000` из QueryClient defaults (WS-инвалидация уже покрывает свежесть; `refetchOnWindowFocus` оставить).
2. Удалить `api/test-auth/route.ts` и `api/route.ts` (hello world).
3. `trips/join/route.ts` GET: добавить `requireUser` и rate-limit (см. Phase 4, пока — существующий `lib/rate-limit.ts`, 30/мин на пользователя).
4. `server.ts`: обработчики SIGTERM/SIGINT → `io.close()` → `server.close()` → `prisma.$disconnect()`; лог «shutting down».
5. `db.ts`: `log: ['query']` только при `NODE_ENV !== 'production'`; синглтон PrismaClient — всегда (убрать условие по NODE_ENV).
6. Удалить корневые `docker-compose.yml` и `Dockerfile` (расходящиеся копии) — единственный деплой-набор остаётся в `docker-deploy/`. Caddyfile на хосте не зависит от них.

**Acceptance:**
- `curl -X POST /api/test-auth` → 404; `GET /api` → 404.
- Неавторизованный `GET /api/trips/join?code=…` → 401.
- `kill -TERM <pid>` процесса сервера → в логе «shutting down», процесс завершается < 5 c, открытый запрос не рвётся посреди записи.
- В логах dev-режима видны SQL-запросы, в prod-сборке — нет.
- `git grep -n "refetchInterval" src/` не находит глобального дефолта.

---

## Phase 1 — Realtime: JWT на handshake + publish-интерфейс (ADR-0004)

**Цель:** закрыть два продакшен-блокера: неаутентифицированный `/emit` и socket.io без проверки доступа; у коммуникаций появляется один интерфейс `publish`.

**Файлы:** новый `src/lib/ws-bus.ts`, `server.ts`, `server/socket-handlers.ts`, `server/rooms.ts`, удалить `server/emit-handler.ts`, `src/lib/ws-emit.ts` и все его вызовы (grep `ws-emit`).

**Шаги:**
1. `src/lib/ws-bus.ts` (server-only): синглтон io на `globalThis` (устойчив к HMR):

   ```ts
   export function setIo(io: IOServer) { (globalThis as any).__tripIo = io; }
   export function publish(tripId: string, event: string, payload: unknown) {
     (globalThis as any).__tripIo?.to(`trip:${tripId}`).emit(event, payload);
   }
   ```

   Next и `server.ts` живут в одном процессе (custom server), поэтому HTTP-мост `/emit` не нужен вовсе.
2. `server.ts`: после создания io — `setIo(io)`. Удалить `handleEmitRequest`; `/emit` больше не существует (404 от Next).
3. Handshake-аутентификация: `io.use()` — читать cookie сессии (тот же JWT, что проверяет `getJwtSecret()` из `src/lib/api-auth.ts`), при валидности вешать `socket.data.userId`, иначе `next(new Error("unauthorized"))`.
4. `trip:join`: проверять членство `TripMember { tripId, userId }` через prisma (кэшировать результат на сокете), иначе `error` + disconnect от комнаты. `trip:leave` — без проверки.
5. Сокет становится **read-only каналом**: любые другие client→server события — игнорировать (логировать раз в N). Все мутации идут через HTTP API; grep по `socket.emit` на клиенте — должен остаться только `trip:join`/`trip:leave`.
6. Заменить вызовы `wsEmit(...)` в API-маршрутах на `publish(tripId, event, payload)`; вызовы `sendPushToTripMembers` остаются в тех же местах API (не в сокет-слое).
7. `WS_ALLOWED_ORIGINS` в проде — точный домен (напр. `https://triptrek.example`), не `*`.

**Acceptance:**
- `curl`/ws-клиент без cookie → сервер закрывает соединение (ошибка handshake).
- Аутентифицированный сокет шлёт `trip:join` с чужим tripId → получает `error`, в комнате не состоит (проверить: события поездки не приходят).
- `POST /emit` → 404; `git grep -n "emit-handler\\|ws-emit"` пуст.
- Поддельное `socket.emit("photo:added", …)` от клиента не разносится по комнате.
- Два браузера (два участника одной поездки) по-прежнему получают события в реальном времени; участник другой поездки — нет.
- Web Push приходит на мутацию (расход), отправленную через API.

---

## Phase 2 — Storage-модуль: S3-адаптер с первого дня (ADR-0003)

**Цель:** все файлы (фото, аватары, блюда) проходят через один модуль с политикой; в проде — S3-совместимое хранилище, в dev — диск.

**Файлы:** новые `src/lib/storage/index.ts`, `src/lib/storage/disk.ts`, `src/lib/storage/s3.ts`; рефакторинг `src/app/api/photos/route.ts`, `src/app/api/user/avatar/route.ts`, `src/app/api/foods/route.ts`, `src/app/api/photos/[id]/route.ts` (DELETE), `src/app/api/trip/import/route.ts` (валидация url), `server/static-uploads.ts` (только для disk-режима).

**Интерфейс модуля:**

```ts
put(input: { data: Buffer; kind: "photo" | "avatar" | "food"; contentType?: string }): Promise<{ key: string; url: string }>
remove(urlOrKey: string): Promise<void>
```

**Шаги:**
1. Политика внутри модуля (единая для всех adapter): magic-byte сниффинг (jpeg/png/webp/heic/gif), лимиты по kind (photo 20MB, avatar 5MB, food 10MB), имя = `crypto.randomUUID()`, для photo/avatar/food — обработка **sharp**: `.rotate()` (EXIF-ориентация) → ресайз (photo: 1600px + thumb 480px) → jpeg q80; **оригинал никогда не сохраняется как есть** — это закрывает утечку GPS из EXIF.
2. HEIC: sharp (prebuilt) декодирует HEIF/HEIC — добавить тест-файл .heic в проверку; при неудаче декодирования — 415 с понятной ошибкой.
3. Adapter `disk`: пишет в `public/uploads/<kind>/`, раздача — существующий `server/static-uploads.ts`. Используется при `STORAGE_DRIVER=disk` (dev).
4. Adapter `s3`: `@aws-sdk/client-s3`, env `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` (публичный base bucket-CDN). `put` = PutObject (public-read), `url = ${S3_PUBLIC_BASE_URL}/${key}`. Провайдер (R2 / Яндекс / Selectel) определяется endpoint-ом — код один.
5. Рефакторинг трёх маршрутов на `storage.put(...)`; удаление фото/еды → `storage.remove(url)` (убрать прямые `fs.unlink`).
6. `trip/import`: принимать только url с префиксом `S3_PUBLIC_BASE_URL` (или `/uploads/` для disk) — иначе null (без фото).
7. Зависимость `@aws-sdk/client-s3` добавить в package.json.

**Acceptance:**
- Загрузка фото при `STORAGE_DRIVER=disk` работает как раньше (регресс: галерея, аватар, еда).
- При `STORAGE_DRIVER=s3` и тестовом bucket: фото появляется в bucket, `url` ведёт на `S3_PUBLIC_BASE_URL`.
- `exifr.gps(загруженный файл)` → undefined (GPS выпилен); ориентация применена.
- Файл 25MB → 413; файл с подделанным content-type, но не-картиночным содержимым → 415.
- Удаление фото удаляет объект из bucket (или с диска).
- `next build` проходит.

---

## Phase 3 — Postgres + миграции + транзакции (ADR-0002)

**Цель:** конкурентная запись многих пользователей, деплой без риска потери данных, атомарные многошаговые операции.

**Файлы:** `prisma/schema.prisma`, `prisma/migrations/` (новая), `src/lib/db.ts`, `src/app/api/trip/import/route.ts`, `docker-deploy/{Dockerfile,entrypoint.sh,docker-compose.yml}`.

**Шаги:**
1. `schema.prisma`: `provider = "postgresql"`. Пройтись по моделям: `String` → при необходимости `@db.Text` для длинных полей (журнал, описания), проверить отсутствие sqlite-специфики.
2. Поднять локально `postgres:16-alpine` (docker run или временный compose), `DATABASE_URL=postgres://…` → `prisma migrate dev --name init` — создать базлайн-миграцию. Закоммитить `prisma/migrations/`.
3. `docker-deploy/entrypoint.sh`: заменить `prisma db push --accept-data-loss` на `prisma migrate deploy` (+ ожидание готовности БД: цикл `pg_isready` или retry на connect).
4. `docker-deploy/docker-compose.yml`: сервис `db` (postgres:16-alpine, volume `pgdata`, healthcheck `pg_isready`), `DATABASE_URL` app-сервиса — на `db:5432`; depends_on с condition: service_healthy.
5. Транзакции: `trip/import` — весь импорт в `prisma.$transaction(async tx => …)` (сейчас ~11 последовательных create-циклов, `tx` прокидывать во все create); проверить аналогичные многошаговые места (день+места, join+member).
6. `photos` POST: порядок «файл → запись в БД», при ошибке БД — компенсирующий `storage.remove` (файловая система не транзакционна — так и оставить, зафиксировать комментарием).
7. `db.ts`: connection pool в URL (`?connection_limit=10`), health-check готов в Phase 4.

**Acceptance:**
- С чистого volume: `docker compose up` → схема создана миграцией, приложение работает; `docker compose restart` → данные на месте, в логах `migrate deploy` «No pending migrations».
- Схема меняется новой миграцией (`prisma migrate dev`) и применяется в контейнере без ручных действий.
- Импорт trip-JSON с намеренно битым элементом в середине → в БД **ничего** не осталось (атомарность).
- Параллельные записи (скрипт: 20 одновременных POST расходов) — без ошибок; на SQLite этот же скрипт падал/тормозил (до-миграционный бенчмарк не обязателен).

---

## Phase 4 — Rate limiting + outbound HTTP + наблюдаемость

**Цель:** один модуль лимитов (store-шов под Redis), устойчивые внешние вызовы, видимость ошибок.

**Файлы:** `src/lib/rate-limit.ts` (переписать), точки применения (ниже), новый `src/lib/outbound.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/api/health/route.ts`, `src/lib/logger.ts` (новый), `src/lib/auth.ts` (убрать [AUTH]-логи), `next.config.ts`, `ai-summary/route.ts`, `nearby/route.ts`, `foods/suggest/route.ts`, `weather/route.ts`, `currency/route.ts`, `city-search/route.ts`, `geocode/route.ts`.

**Шаги:**
1. `rate-limit.ts`: интерфейс `limit(key, { max, windowMs }): { ok, retryAfterSec }`; `MemoryStore` с периодической чисткой (интервал 10 мин) за внутренним интерфейсом Store (Redis-adapter позже — ADR-0005). Ключ: `userId`, если есть, иначе IP из `X-Forwarded-For` (доверять только за Caddy; ключ `x-triptek-rl` не нужен — Caddy перезаписывает XFF).
2. Таблица лимитов (применить): login 5/15мин, register 3/ч, join POST 10/ч и GET 30/мин, photos POST 20/ч, avatar 10/ч, foods POST 20/ч, import 2/ч, ai-summary 10/ч (перенести существующий самодельный лимитер), foods-suggest 20/ч, nearby 60/ч, weather/currency/city-search 60/мин на IP. Три самодельные Map-реализации (ai-summary, nearby, foods/suggest) — удалить.
3. `outbound.ts`: `fetchJson<T>(url, { timeoutMs = 8000, retries = 1, cacheSec })` на `AbortSignal.timeout`; User-Agent для Nominatim (политика использования); кэш: city-search/geocode 1 день, weather 10 мин, currency 1 ч (in-memory Map с TTL достаточно для одного инстанса).
4. LLM-вызовы (ai-summary, foods/suggest): таймаут 60 с через тот же outbound; локальный fallback-черновик остаётся.
5. Наблюдаемость: `error.tsx` + `global-error.tsx` (экран «что-то сломалось» + кнопка перезагрузки, без деталей); `/api/health` → `prisma.$queryRaw\`SELECT 1\`` + версия, 503 при недоступности БД; `logger.ts` (info/warn/error, JSON-строка в prod); убрать [AUTH]-логи из `lib/auth.ts`.
6. `next.config.ts`: удалить `typescript.ignoreBuildErrors`; починить ошибки tsc (известная старая — `prisma/seed-budget-plans.ts`; seed-скрипты исключить из tsconfig, если чинить нецелесообразно).

**Acceptance:**
- 6-й подряд POST /api/trips/join с неверным кодом → 429.
- 21-я загрузка фото за час одним пользователем → 429.
- `city-search` дважды с тем же запросом → второй ответ из кэша (по логу/заголовку).
- Тест внешнего вызова с недоступным хостом → ответ через ≤ timeoutMs, не висит.
- `npx tsc --noEmit` — 0 ошибок; `next build` зелёный.
- Остановить контейнер db → `/api/health` отвечает 503; поднять → 200.
- КиřenЬ любой страницы с намеренной ошибкой рендера (временно) → error boundary, не белый экран.

---

## Phase 5 — Деплой: compose, Caddy, TLS, бэкапы (ADR-0001, 0006, 0008)

**Цель:** воспроизводимый деплой на чистый VPS из репозитория, автоматические бэкапы, проверенное восстановление.

**Файлы:** `docker-deploy/` (финальная правка), новый `docker-deploy/Caddyfile`, `docker-deploy/backup.sh`, `docker-deploy/DEPLOY.md` (runbook), `docs/adr/` без изменений.

**Шаги:**
1. `docker-compose.yml` (один, в `docker-deploy/`): сервисы `db` (postgres:16-alpine, volume `pgdata`), `app` (build из Dockerfile, depends_on db healthy, env ниже, healthcheck `/api/health`, `restart: unless-stopped`, `stop_grace_period: 30s`), `caddy` (volume caddy_data, ports 80/443, `reverse_proxy app:3000`, XFF перезапись).
2. TLS: домен → Cloudflare DNS (сперва DNS-only/серое облако), Caddy получает Let's Encrypt по HTTP-01 (порты 80/443 открыты). После проверки — включить оранжевое облако (прокси), TLS-режим Cloudflare → Full (strict). Альтернатива для РФ/РБ-провайдеров без отличий: то же самое.
3. Приложение: `NEXTAUTH_SECRET` (openssl rand -base64 32), `DATABASE_URL=postgres://triptrek:…@db:5432/triptrek`, `WS_ALLOWED_ORIGINS=https://<домен>`, `STORAGE_DRIVER=s3`, `S3_*`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`), `OPENAI_API_KEY` опционально (есть локальный fallback). Секреты — в `.env` рядом с compose (не в git; в `.gitignore` уже).
4. Dockerfile: non-root user для app; `NODE_ENV=production`; entrypoint: ожидание БД → `prisma migrate deploy` → запуск сервера.
5. Файрвол VPS: открыты только 22 (ключи), 80, 443. App наружу не светить (caddy в той же сети).
6. `backup.sh`: `docker exec db pg_dump -U triptrek triptrek | gzip` → rclone (`rclone copy` в S3-bucket, префикс `backups/postgres/`), ротация 30 дней (`rclone delete --min-age 30d`); cron на хосте — nightly 04:00. Фото уже в bucket — отдельный бэкап не нужен, но включить versioning на bucket, если провайдер позволяет.
7. `DEPLOY.md` (runbook): первичный деплой с нуля; обновление (`git pull && docker compose up -d --build`); просмотр логов; **восстановление из бэкапа** (распаковка → `psql` в свежую БД → проверка); чеклист после деплоя (health, логин, upload фото, WS-событие, push).

**Acceptance (полные учения):**
- На чистом VPS по `DEPLOY.md` с нуля до рабочего https за один проход.
- Два телефона: регистрация, join по инвайт-коду, добавление фото — второй видит событие в реальном времени.
- `docker compose down && up` — данные и фото на месте.
- Восстановление: бэкап ночного прогона накатывается на пустую БД, приложение работает (проверить один раз вручную).
- Внешний сканер: `POST /emit` 404, socket без JWT не подключается, `/api/health` 200.

---

## Phase 6 — Мобильный полиш (после запуска)

**Цель:** довести UX до «99% с телефона».

- Проверить вёрстку всех страниц на 360–414px ширины и в мобильном Safari (известная база: 16px-инпуты, 44px-таргеты — уже сделаны ранее).
- Тяжёлые запросы (`/api/trip` с глубокими include) — обрезать payload; проверить TTI на throttled 3G в DevTools.
- Ленивая загрузка сетки галереи (`loading="lazy"`, thumb 480px уже есть).
- HEIC-фото с iPhone end-to-end (съёмка → загрузка → отображение).
- Lighthouse mobile по ключевым страницам; заметить регрессии.
- Опционально: AVIF-варианты вместо jpeg при той же политике размера.

## Отложено (не делать в этих фазах)

SMTP-сброс пароля (владелец поднимет на своём VPS позже) · OAuth · Sentry · GitHub Actions-пайплайн · Redis (WS-adapter, rate-limit store) · несколько инстансов · приватная раздача фото · PWA/offline.

## Инвентарь секретов/env (прод)

| Переменная | Куда | Откуда взять |
|---|---|---|
| `NEXTAUTH_SECRET` | app | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | db+app | сгенерировать, в `.env` рядом с compose |
| `NEXTAUTH_URL` | app | `https://<домен>` |
| `DOMAIN`, `ACME_EMAIL` | caddy | домен + email для Let's Encrypt |
| `WS_ALLOWED_ORIGINS` | app | `https://<домен>` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | app | `npx web-push generate-vapid-keys` (опц.) |
| `OPENAI_API_KEY` (опц.), `OPENAI_BASE_URL`, `OPENAI_MODEL` | app | провайдер LLM; без ключа — локальный fallback |

Хранилище — локальный том `triptrek-uploads` (S3_* больше не нужны); бэкапы
uploads включены в `docker-deploy/backup.sh` (ADR-0003 amended).
