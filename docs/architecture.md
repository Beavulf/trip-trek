# Архитектура TripTrek

Входная точка для агента — [AGENTS.md](../AGENTS.md). Здесь — «как всё устроено и
почему так». Карта HTTP-роутов: [api.md](api.md). Словарь терминов: [glossary.md](glossary.md).
История решений: [adr/](adr/).

## 1. Общая схема

```
            браузер (PWA, SPA)
   TanStack Query ── fetch ──► ┌─────────────────────────────────────────────┐
   socket.io-client ── ws ───► │ Caddy (TLS, 80/443) → app:3000              │
                               │  ┌───────────────────────────────────────┐  │
   внешние API                 │  │ bun server.ts — ОДИН процесс:         │  │
   Nominatim (геокод) ◄────────┼─►│  • Next.js HTTP (App Router)          │  │
   Open-Meteo (погода) ◄───────┼─►│  • socket.io  (path /socket.io/)      │  │
   open.er-api.com (курсы) ◄───┼─►│  • /uploads/* (том докера, мимо Next) │  │
   LLM (BYOK/baseUrl) ◄────────┼─►│  • API-роуты = src/app/api/**         │  │
                               │  └───────────┬───────────────────────────┘  │
                               │              │ Prisma                       │
                               │         Postgres (контейнер)                │
                               └─────────────────────────────────────────────┘
```

Ключевое решение: Next HTTP, WS и API-роуты живут в **одном bun-процессе**
(`server.ts`). Поэтому realtime-событие из API-роута — это прямой вызов
`publish()` из `src/lib/ws-bus.ts`, никакого HTTP-моста `/emit` нет
(был — выпилен). `io` кладётся в `globalThis`, чтобы переживать HMR.

`server.ts` также обязан до импорта next подставить настоящий
`node:async_hooks.AsyncLocalStorage` в `globalThis` (иначе Next 16 под bun ставит
Fake и падает на первом unhandled-rejection) и держит свои обработчики
`unhandledRejection`/`uncaughtException`. Graceful shutdown: SIGTERM → io.close →
server.close → `db.$disconnect`.

Модули `server/`:

| Файл | Роль |
|---|---|
| `ws-auth.ts` | JWT-handshake socket.io (cookie `next-auth.session-token`), анонимов отбиваем |
| `socket-handlers.ts` | регистрация событий WS; канал **read-only** — клиент только слушает |
| `rooms.ts` | учёт «какой сокет в какой trip-комнате» (`TripRooms`) |
| `notification-map.ts` | конфиг WS-событие → emoji+текст для уведомлений |
| `static-uploads.ts` | раздача `/uploads` с диска напрямую (том не попадает в standalone-сборку Next) |

## 2. Frontend

- `src/app/page.tsx` — **весь SPA** поездки: табы (dashboard, timeline, map,
  itinerary, budget, gallery, board, journal, food, phrases, info, chill…)
  из `src/lib/trip-store.ts` (zustand + persist). Переключение поездок —
  `trip-switcher.tsx`. Корень защищён middleware (307 на `/login` без cookie).
- `src/components/trip/` — фичи. Тяжёлые блоки вынесены в подпапки:
  `budget/`, `map/`, `food/`, `phrases/`, `dashboard/`, `rest-chill/`, `profile/`.
- **Слой данных — хуки** `src/hooks/trip/use-*.ts` поверх TanStack Query:
  queryKey всегда включает `tripId` (из `use-trip-id`/`getTripId()`), иначе после
  переключения поездки показываются чужие данные. Компоненты не делают `fetch` сами.
  После WS-события хуки инвалидируют соответствующий query.
- `src/hooks/` корневые: `use-auth.ts`, `use-websocket.ts`, `use-notifications.ts`,
  `use-push.ts`, `use-admin-stats.ts`.
- Карта — react-leaflet (`components/trip/map/`, `trip-map.tsx`); перетаскивание
  на телефонах оптимизировано отдельно (см. worklog, коммит 732af38).

## 3. Backend: API-роуты

Все роуты — App Router `route.ts` в `src/app/api/**` (полная карта с методами,
гардами и лимитами — [api.md](api.md)). Скелет любого роута:

```ts
const { user, response } = await requireTripMember(req, tripId); // гард из api-auth.ts
if (response) return response;
const body = Schema.parse(await req.json());                     // zod
// ... prisma-мутация ...
publish(tripId, "place:updated", place);                         // realtime (ws-bus)
return NextResponse.json(result);
```

- Гард-функции: `requireUser` / `requireTripMember` / `requireTripOwner` /
  `requireAdmin` (`src/lib/api-auth.ts`). Роль admin читается из БД всегда
  (токен живёт 30 дней, понизили роль — доступ отберётся сразу).
- Сессия: JWT подписан `NEXTAUTH_SECRET`, проверка `passwordChangedAt` против
  `iat` — и в `api-auth`, и в `src/app/api/auth/custom-session/route.ts`.
- Rate limit: `rateLimitMiddleware` (по IP, для анонимных) и `userRateLimit`
  (по user, для тяжёлых действий) — `src/lib/rate-limit.ts`. In-memory,
  ADR-0005; обнуляется рестартом контейнера.
- Внешние вызовы — только `src/lib/outbound.ts`: таймаут, один ретрай, TTL-кэш,
  null при неудаче; у каждого вызова свой fallback.
- Логи — `src/lib/logger.ts`; админ-действия пишутся в `AdminLog`
  (`src/lib/admin-log.ts`), ключи/пароли в meta запрещены.

## 4. Realtime

Поток: API-роут → `publish(tripId, event, payload)` (`ws-bus.ts`) → `io.to(room)`
→ `socket.io-client` в браузере → хуки инвалидируют query → рефetch.

События (полный актуальный список — `grep -r "publish(tripId"` src):
`trip:updated`, `place:created|updated|deleted`, `photo:added`, `expense:added`,
`budget:updated`, `board:added`, `journal:added`, `checklist:updated`,
`info:updated`, `food:updated`, `phrase:updated`.

Правила: WS-канал отдаёт только «что-то изменилось» (payload минимален или пуст),
истину клиент добирает через API. Новое событие = добавить publish в роут +
инвалидацию в хук + строку в `server/notification-map.ts` (если нужен колокольчик).

## 5. Модель данных (Prisma / Postgres)

Схема: `prisma/schema.prisma`, все связи каскадные от Trip. Ядро:

```
User ──< TripMember >── Trip ──< Day ──< Place ──< Photo
              │            │  ├──< Photo, Expense, JournalEntry
              │            │  ├──< BoardMessage (чат, replies, reactions-JSON)
              │            │  ├──< ChecklistItem, InfoItem, Phrase, FoodItem
              │            │  └──< BudgetPlan (уникален по tripId+category)
              │            └──< TripBan (бан юзера в конкретной поездке)
   глобальное: AppSettings (singleton id="app"), AdminLog,
               PushSubscription, UserNotification, PasswordResetToken, Feedback
```

Соглашения, которые легко сломать:

- **Expense**: `amount` — всегда в валюте поездки; то, что ввёл юзер, —
  `originalAmount`/`originalCurrency`. Делёж — `splitWith` (строка с userId через
  запятую, пусто = личная) + `excludeSelf`. Переводы-погашения идемпотентны по
  `settlementKey` (уникальный, формат в схеме) — поэтому одну пару долгов можно
  гасить многократно. Логика дележа/долгов — `src/lib/budget/` (split, balances,
  settle), не дублируй её в роутах.
- **Photo**: `url`/`thumbUrl` (storage пайплайн), координаты из EXIF (`exifr`),
  `userId` — кто загрузил (SetNull при удалении аккаунта).
- **Phrase**: колонки `ru`/`cn`/`pinyin` исторические; реальный язык — `language`
  (код: zh, ja, fr…). null у записей до миграции.
- **FoodItem**: голоса «хочу попробовать» — `wantedBy` (JSON-строка массива userId).
- **BoardMessage.reactions** — JSON-строка `{"👍":["userId",…]}`.
- **AppSettings** — singleton-строка `id="app"`; до первой записи её нет, тогда
  действуют дефолты кода (`src/lib/app-config.ts`): registrationEnabled,
  freeTripLimit=1, freeMemberLimit=5, общий ключ ИИ.
- Текущий день поездки — только `calculateCurrentDayNumber` из
  `src/lib/trip-days.ts` (формула уже расходилась между роутами — не дублируй).

## 6. Файлы и фото

`src/lib/storage/` — единый пайплайн загрузок: sharp (сжатие, превью),
`UPLOADS_ROOT` (`storage/root.ts`), лимиты размеров, пути `/uploads/<scope>/...`.
Используется для фото, аватаров, скриншотов фидбека. В проде файлы живут на
докер-томе `triptrek-uploads`; их раздаёт `server/static-uploads.ts` до Next
(в standalone-сборку рантайм-файлы не попадают). Решение «локальный диск вместо
S3» — ADR-0003.

## 7. Сессии, аккаунты, почта

- Логин: `POST /api/auth/custom-login` (bcrypt, `src/lib/password.ts`) → ставит
  JWT-cookie; `[...nextauth]` оставлен для совместимости, но клиент ходит в
  custom-роуты (`custom-login/custom-session/custom-signout`) — Turbopack-совместимость.
- Регистрация: `register` (+ welcome-письмо), сброс пароля: `forgot-password` →
  одноразовый токен (в БД только sha256-хеш, TTL 60 мин) → письмо → `reset-password`.
  Смена пароля в профиле: `user/password` — инвалидирует все сессии через
  `passwordChangedAt`.
- Почта: `src/lib/mail/mailer.ts` (nodemailer через постфикс-релей; для
  самоподписанного STARTTLS-серта стоит `tls.rejectUnauthorized: false` — только
  для локального релея) + шаблоны `templates.ts`.

## 8. ИИ и монетизация

- Резолв ключа (`src/lib/ai-key.ts`): свой `User.aiApiKey` (BYOK) → `AppSettings`
  админа → `OPENAI_API_KEY`. Пользователь видит только маску; проверка ключа —
  `user/ai-key-check`. Все вызовы LLM идут через `outbound.ts`.
- ИИ-фичи: `ai-summary` (итоги поездки), `phrases/ai` + `phrases/generate`
  (разговорник), `foods/suggest` (блюда). Лимит 10/ч на user+trip на каждую.
- Премиум: `isPremiumUser` (`plan=premium`, `planExpiry` не истёк). Выдача —
  вручную админом (`admin/users`) или `user/upgrade` (заглушка/ручной сценарий —
  известная дыра продакшена, см. `docs/PRODUCTION_PLAN.md`). Лимиты free читаются
  из `AppSettings`.

## 9. Уведомления

`src/lib/notify.ts` — единая точка: всегда пишет `UserNotification` (колокольчик,
`/api/notifications`), при настроенном VAPID дублирует web-push
(`push-send.ts`). Всё fire-and-forget — сбой пуша не роняет основную операцию.
Клиент: `use-push.ts`, `notifications-bell.tsx`.

## 10. Деплой

Один VPS: docker compose (app + Postgres + Caddy), TLS Let's Encrypt, фото на
томе, бэкапы `docker-deploy/backup.sh` (rclone в S3-совместимое хранилище).
Runbook с командами — `docker-deploy/DEPLOY.md`; мотивации — ADR-0001/0002/0003/
0006/0008. Обновление: `git pull && docker compose up -d --build app && docker image prune -f`.
