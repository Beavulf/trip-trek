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
  null при неудаче; у каждого вызова свой fallback. Исключение — LLM: все вызовы
  через оркестратор `runAi` (`src/lib/ai.ts`), которому нужны HTTP-статус для
  учёта, `redirect:"error"` против увода ключа и никакие ретраи (платно).
- Логи — `src/lib/logger.ts`; админ-действия пишутся в `AdminLog`
  (`src/lib/admin-log.ts`), ключи/пароли в meta запрещены.

## 4. Realtime

Поток: API-роут → `publish(tripId, event, payload)` (`ws-bus.ts`) → `io.to(room)`
→ `socket.io-client` в браузере → хуки инвалидируют query → рефetch.
Инвалидации тяжёлых ключей в `use-websocket.ts` идут через дебаунс ~400 мс:
burst событий (загрузка N фото = N `photo:added`) схлопывается в одну волну
рефетчей. Reconnect бесконечный (backoff до 30 c) — realtime не умирает после
сетевой паузы (аудит перфоманса 2026-09-13).

События (полный актуальный список — `grep -r "publish(tripId"` src):
`trip:updated`, `place:created|updated|deleted`, `photo:added`, `expense:added`,
`budget:updated`, `board:added`, `journal:added`, `checklist:updated`,
`info:updated`, `food:updated`, `phrase:updated`.

Правила: WS-канал отдаёт только «что-то изменилось» (payload минимален или пуст),
истину клиент добирает через API. Новое событие = добавить publish в роут +
инвалидацию в хук + строку в `server/notification-map.ts` (если нужен колокольчик).

Гарантии доступа (hardening 2026-09-12): handshake повторяет HTTP-инварианты —
JWT + существование юзера + `passwordChangedAt` (токен до смены пароля WS не
проходит). Удаление TripMember (исключение/бан/выход/админ) обязано звать
`evictUserFromTrip(tripId, userId)` из `ws-bus.ts` — иначе открытая вкладка
исключённого продолжала бы получать события комнаты.

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
               PushSubscription, UserNotification, PasswordResetToken, Feedback,
               AiUsage (учёт вызовов ИИ: feature/keySource/токены, без промптов)
```

Соглашения, которые легко сломать:

- **Expense**: `amount` — всегда в валюте поездки; то, что ввёл юзер, —
  `originalAmount`/`originalCurrency`. Делёж — `splitWith` (строка с userId через
  запятую, пусто = личная) + `excludeSelf`. Переводы-погашения идемпотентны по
  `settlementKey` (уникальный **в рамках поездки**, `@@unique([tripId, settlementKey])`;
  формат в схеме) — поэтому одну пару долгов можно гасить многократно.
  Логика дележа/долгов — `src/lib/budget/` (split, balances,
  settle), не дублируй её в роутах.
- **Photo**: `url`/`thumbUrl` (storage пайплайн), координаты из EXIF (`exifr`),
  `userId` — кто загрузил (SetNull при удалении аккаунта).
- **Phrase**: колонки `ru`/`cn`/`pinyin` исторические; реальный язык — `language`
  (код: zh, ja, fr…). null у записей до миграции.
- **FoodItem**: голоса «хочу попробовать» — `wantedBy` (JSON-строка массива userId).
- **BoardMessage.reactions** — JSON-строка `{"👍":["userId",…]}`.
- **Trip.allowMemberInvites** — политика приглашений: `true` (дефолт) — код видят
  все участники, `false` — только владелец (GET /api/trip прячет `inviteCode`,
  join по коду не меняется). Переключается владельцем из «О поездке»
  (PATCH /api/trip).
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
- Обучение: `User.onboardingCompletedAt` (`null` = welcome-tour покажется при
  входе на `/`; пока он не закрыт, обучалки вкладок молчат). Мутация —
  `PATCH /api/user {onboardingCompleted: boolean}`; шаги туров и обучалок
  вкладок — `src/lib/onboarding.ts`, компоненты —
  `src/components/trip/onboarding/` (общая карточка — tour-dialog.tsx),
  отметки на устройстве дублируются в localStorage (защита от повторного
  открытия, пока PATCH в пути).
- Почта: `src/lib/mail/mailer.ts` (nodemailer через постфикс-релей; для
  самоподписанного STARTTLS-серта стоит `tls.rejectUnauthorized: false` — только
  для локального релея) + шаблоны `templates.ts`.

## 8. ИИ и монетизация

- Единая точка — `runAi` (`src/lib/ai.ts`): блок админа → лимит фичи → резолв
  ключа → вызов провайдера → учёт в `AiUsage` → алерт трат (всё
  fire-and-forget, сбои учёта не роняют фичу). Новая ИИ-фича = запись в
  `AI_FEATURES` (`src/lib/ai-usage.ts`) + промпты в своём роуте.
- Резолв ключа (`src/lib/ai-key.ts`, чистая `pickAiConfig`): свой ключ юзера
  (полный BYOK: + свой `aiBaseUrl`/`aiModel`; инвариант — юзерский адрес
  получает только юзерский ключ) → `AppSettings` админа → `OPENAI_API_KEY`.
  Пользователь видит только маску; проверка своего трио — `user/ai-key-check`.
- Учёт и алерты: каждая попытка вызова пишется в `AiUsage` (только метаданные:
  feature, keySource, токены, длительность; промпты/ответы — никогда). Пороги
  `AppSettings.aiAlertCallsPerDay/aiAlertTokensPerDay` (0 = выключено) — при
  превышении админы получают уведомление (дедуп — атомарный клейм
  `User.aiAlertedAt` раз в UTC-сутки). Раздел `/admin/ai`: телеметрия, юзеры с
  порогами, блокировка ИИ (`User.aiBlocked` — полный запрет любого источника).
- ИИ-фичи: `ai-summary` (итоги поездки, при недоступности LLM — локальный
  черновик), `phrases/ai` + `phrases/generate` (разговорник), `foods/suggest`
  (блюда, `count` 4–10). Лимит 10/ч на user+trip; `ai/planner` — 3/ч,
  `ai/restaurants` и `ai/walk` — 6/ч.
- Генерация с проверкой по реальным данным (`src/lib/poi.ts`,
  `src/lib/geocode-place.ts`): планер маршрута предлагает черновик по
  **существующим** дням, координаты добывает Nominatim по `nameEn`,
  `fail` → «уточнить на карте»; рестораны и прогулки собираются из реальных
  POI OpenStreetMap (Overpass), ИИ только отбирает — имена и координаты всегда
  из OSM (`matchPicksToPois` отбрасывает выдумки). В поездку попадает только
  отмеченное юзером (`POST /api/places/batch`, одна WS-публикация).
- Премиум: `isPremiumUser` (`plan=premium`, `planExpiry` не истёк). Выдача —
  вручную админом (`admin/users`) или `user/upgrade` (заглушка/ручной сценарий —
  известная дыра продакшена, см. `docs/PRODUCTION_PLAN.md`). Лимиты free читаются
  из `AppSettings`. Шов премиум-гейта ИИ — поле `access` в `AI_FEATURES`
  (`"all"` у всех; `"premium-or-byok"` включит гейт без правок оркестратора).

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
