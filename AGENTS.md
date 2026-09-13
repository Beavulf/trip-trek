# TripTrek — путеводитель для ИИ-агента

TripTrek — веб-приложение для совместного планирования путешествий: маршрут по дням,
карта, бюджет с расчётом долгов, галерея, дневник, чат, гастрогид, разговорник (PWA,
realtime). Один пользователь-владелец кода, прод на одном VPS.

**Этот файл — точка входа.** Он даёт карту проекта; детали — в связанных документах.
Не перечитывай весь репозиторий с нуля: начни отсюда и иди по ссылкам.

## Стек

- **Next.js 16** (App Router, SPA на `/`) + React 19 + TypeScript, Tailwind 4 + shadcn/ui,
  TanStack Query 5, Zustand, leaflet (карты), next-intl (обёртка, UI по-русски).
- **Кастомный сервер `server.ts` под Bun**: в ОДНОМ процессе живут Next.js HTTP,
  socket.io (WS) и раздача `/uploads`. API-роуты Next и WS-шина — один процесс,
  поэтому realtime-события публикуются прямым вызовом `publish()`, без HTTP-моста.
- **Prisma 6 + PostgreSQL** (схема: `prisma/schema.prisma`).
- Аутентификация — свой JWT в cookie `next-auth.session-token` (NextAuth v4
  Credentials; см. «Авторизация» ниже). Почта — nodemailer, пуш — web-push (VAPID).
- Рантайм — **Bun** (не Node): `bun server.ts`. Turbopack отключён
  (`webpack: true` в `next({ dev, webpack: true })` — воркараунд резолва @prisma/client).

## Команды

```bash
bun server.ts            # dev-сервер целиком (Next + WS + uploads) на :3000
bun run lint             # ESLint
bun run test / :watch    # vitest — юнит-тесты чистых функций (src/**/*.test.ts, node-env)
bun run db:up / db:down  # Postgres в docker (docker-compose.dev.yml)
bun run db:migrate       # prisma migrate dev
bun run db:generate      # prisma generate (после правок schema.prisma)
bun run db:seed          # сид (Китай), db:admin — сделать юзера админом
bun run build            # production-сборка standalone
```

Тестовые аккаунты (dev, сид): `you@` / `leha@` / `den@triptrek.com`, пароль `1234`.

## Карта репозитория

| Путь | Что там |
|---|---|
| `server.ts` | entry: Next + socket.io + `/uploads`, graceful shutdown |
| `server/` | `ws-auth.ts` (JWT handshake), `socket-handlers.ts`, `rooms.ts` (trip-комнаты), `notification-map.ts`, `static-uploads.ts` |
| `src/app/` | страницы: `/` (весь SPA поездки), `/login`, `/join/[code]`, `/profile`, `/reset-password`, `/admin/*`; `api/` — все бэкенд-роуты (карта: `docs/api.md`) |
| `src/components/trip/` | фичи главного экрана: itinerary, budget/, map/, gallery, board (чат), journal, food/, phrases/, timeline, dashboard/… |
| `src/components/admin/`, `auth/`, `ui/` | админка, логин/регистрация, shadcn-кит |
| `src/hooks/trip/` | `use-*.ts` — слой данных клиента (TanStack Query) над API |
| `src/lib/` | серверная логика: `api-auth.ts`, `rate-limit.ts`, `ws-bus.ts`, `ai-key.ts`, `premium.ts`, `notify.ts`, `mail/`, `storage/`, `budget/`, `outbound.ts`, `db.ts` (Prisma-клиент), `trip-days.ts`, `trip-export.ts`, `trip-templates.ts`, `app-config.ts`; доменные модули маршрута: `time-of-day.ts`, `place-fields.ts` (контракт записи Place), `place-draft.ts`, `route.ts`, `route-threads.ts`, `map-filters.ts`, `map-bus.ts`, `map-layers.ts`, `query-keys.ts`, `place-links.ts`, `onboarding.ts` (шаги welcome-tour + отметки обучения) |
| `prisma/` | `schema.prisma`, миграции, seed, скрипты переноса |
| `docker-deploy/` | прод: Dockerfile, compose, Caddy, `DEPLOY.md` (runbook), бэкапы |
| `docs/` | `architecture.md`, `api.md`, `glossary.md`, `adr/0001–0008`, аудиты фич `audit-*.md`, `PRODUCTION_PLAN.md` |
| `worklog.md` | журнал сессий разработки (что и зачем менялось) — ищи историю там |
| `PATCHNOTES.md`, `SUMMARY-OF-FIXES.md` | исторические сводки фиксов |

## Авторизация (главный паттерн бэкенда)

JWT в cookie `next-auth.session-token`, подпись `NEXTAUTH_SECRET`, 30 дней.
Все API-роуты начинаютcя с одного из гардов **`src/lib/api-auth.ts`**:

- `requireUser(req)` → 401, если нет валидного JWT;
- `requireTripMember(req, tripId)` → 403, если юзер не в TripMember этой поездки;
- `requireTripOwner(req, tripId)` → 403, если не owner;
- `requireAdmin(req)` → 403 (роль **всегда читается из БД**, не из токена).

Смена пароля пишет `User.passwordChangedAt`; JWT с `iat` раньше него отвергается
и в `api-auth`, и в `custom-session` — «выйти на всех устройствах».

## Realtime

API-роут после мутации вызывает `publish(tripId, "place:updated", payload)` из
`src/lib/ws-bus.ts` → socket.io room `trip:<id>` → клиенты инвалидтируют TanStack Query.
События: `trip:updated, place:created/updated/deleted, photo:added, expense:added,
budget:updated, board:added, journal:added, checklist:updated, info:updated,
food:updated, phrase:updated`. Канал read-only для клиента (только уведомления).
WS-handshake требует валидный JWT (`server/ws-auth.ts`), анонимов отбиваем.

## Лимиты, премиум, ИИ

- **Rate limit** — in-memory (`src/lib/rate-limit.ts`, ADR-0005): login 5/15мин/IP,
  register 3/ч/IP, forgot-password 5/ч/IP, ИИ 10/ч на user+trip. Сбрасывается при
  рестарте контейнера. Шов под Redis оставлен (`limit()`).
- **Премиум**: `isPremiumUser()` (`src/lib/premium.ts`) = `plan === "premium"` и
  не истёк `planExpiry`. Лимиты free (`freeTripLimit`, `freeMemberLimit`) — в
  singleton `AppSettings` через `src/lib/app-config.ts`.
- **ИИ (BYOK)**: ключ резолвится по цепочке юзер → админский из `AppSettings` →
  `env OPENAI_API_KEY` (`src/lib/ai-key.ts`); наружу API отдаёт только маску.
  OpenAI-совместимый `aiBaseUrl` + `aiModel`.
- **Внешние HTTP** (Nominatim, Open-Meteo, курсы валют, LLM) — только через
  `src/lib/outbound.ts` (таймаут + ретрай + TTL-кэш, null при неудаче).

## Рецепты (как тут принято делать)

- **Новый API-роут**: `src/app/api/<name>/route.ts`; первым делом гард из api-auth;
  zod для входа; мутации пишут в Prisma и зовут `publish()`; `src/lib/logger.ts` для логов.
  Примеры-образцы: `api/places/route.ts`, `api/checklist/route.ts`.
- **Новая фича на клиенте**: компонент в `src/components/trip/` + хук
  `src/hooks/trip/use-*.ts` (TanStack Query, queryKey включает tripId) + таб в
  `trip-store.ts`. Не ходи в fetch напрямую из компонентов.
- **Смена схемы**: правка `prisma/schema.prisma` → `bun run db:migrate`.
- **Файлы** (аватары, фото, скриншоты): только через `src/lib/storage/` — sharp,
  лимиты, `UPLOADS_ROOT`; `/uploads` в проде отдаётся мимо Next
  (`server/static-uploads.ts`), потому что том докера не попадает в standalone-сборку.
- Комментарии в коде пишутся **по-русски** и объясняют «почему», а не «что».
  Соблюдай стиль существующих файлов.

## Грабли (проверено болью)

- `server.ts` подставляет `AsyncLocalStorage` в globalThis **до** импорта next — под
  bun без этого Next 16 падает на первом unhandled-rejection. Не «упрощай» этот код.
- Turbopack под кастомным сервером не резолвит `@prisma/client` — потому
  `webpack: true`. Не включай turbopack.
- Rate limiter in-memory: после рестарта контейнера счётчики обнуляются.
- Middleware редиректит только `/` на `/login`; страницы APIs защищают себя сами.
- Валидация премиума — только через `isPremiumUser`, не пиши инлайн `plan === "premium"`.
- `calculateCurrentDayNumber` (`src/lib/trip-days.ts`) — единая формула текущего дня,
  не дублируй математику с датами (уже расходились floor/ceil).
- В экспенсе `amount` всегда в валюте поездки; введённая пользователем валюта — в
  `originalAmount/originalCurrency`. Долги гасятся через `settlementKey` (идемпотентность).
- Маршрут на клиенте читается только через `useRoute()`/`useRouteDays()` (GET `/api/route`);
  не ходи в `/api/days`+`/api/trip` параллельно и не resurrectь ключ `["days"]` — он выведен из
  обращения. Инвалидации дней — через `invalidateRouteData` (`src/lib/query-keys.ts`).
- Порядок и подписи слотов времени — только `src/lib/time-of-day.ts`; поля записи Place —
  только `PLACE_PATCHABLE`/`pickPatchablePlace`. Фокус «показать место на карте» — через
  `focusOnMap` (`src/lib/map-bus.ts`), не через стор.
- Императивный Leaflet (`L.*`, тайминги полётов) живёт только в `src/components/trip/map/`
  (`canvas.tsx`, `icons.ts`, `route-threads.tsx`) и `map-picker-client.tsx`. Компонентам карты
  нужен полёт — проси у `MapCanvasHandle` (focusOn/fitPoints/flyToPoints/zoomBy/getCenter).

## Поддержание документации (обязательное правило)

Документация — часть кода: задача считается выполненной, только если доки
обновлены вместе с изменениями, тем же коммитом. Меняешь поведение — обнови док;
«обновлю потом» = оставил следующих агентов с ложной картой проекта.

| Что изменил | Что обновить |
|---|---|
| API-роут (новый, методы, гард, лимит) | таблицу в `docs/api.md`; если менялись лимиты — ещё и сводку «Rate limits» там же |
| WS-событие (новое/удалённое) | список событий в `docs/api.md` и §4 `docs/architecture.md` |
| Схему Prisma или соглашения данных | §5 «Модель данных» в `docs/architecture.md`; новый термин — в `docs/glossary.md` |
| Фичу, таб, крупный компонент | «Фичи главного экрана» в `docs/glossary.md`; новую подсистему — ещё и в `docs/architecture.md` |
| Новый `src/lib/*`-модуль или общий паттерн | карту репозитория и раздел паттернов здесь, в `AGENTS.md` |
| Команды, скрипты, env-переменные | «Команды» в `AGENTS.md` и `docker-deploy/DEPLOY.md` |
| Инфраструктуру, деплой, бэкапы | `docker-deploy/DEPLOY.md` и §10 `docs/architecture.md`; значимое архитектурное решение — новый ADR `docs/adr/NNNN-slug.md` (сначала ADR, потом код) |

Правила обновления: правь только затронутые строки, не переписывай док целиком;
не копируй код в доки — ссылка на файл плюс «почему так» вместо пересказа «что
написано»; заметил, что док разошёлся с кодом (устаревший комментарий,
отсутствующий роут), — исправь сразу, не откладывай в отдельную задачу.

## Прод

Один VPS, docker compose (app + Postgres + Caddy, TLS Let's Encrypt), фото на
локальном томе. Полный runbook: `docker-deploy/DEPLOY.md`. Решения и почему так:
`docs/adr/0001` (один VPS), `0002` (Postgres/миграции), `0003` (storage), `0004`
(realtime auth), `0005` (rate limit), `0006` (бэкапы), `0007` (auth scope), `0008`
(деплой/наблюдаемость).
