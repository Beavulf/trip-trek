# TripTrek — путеводитель для ИИ-агента

TripTrek — веб-приложение для совместного планирования путешествий: маршрут по дням,
карта, бюджет с расчётом долгов, галерея, дневник, чат, гастрогид, разговорник (PWA,
realtime) + отдельный раздел «Сочтёмся» (`/split`) — повседневные траты друзей. Один пользователь-владелец кода, прод на одном VPS.

**Этот файл — точка входа.** Он даёт карту проекта; детали — в связанных документах.
Не перечитывай весь репозиторий с нуля: начни отсюда и иди по ссылкам.

## Стек

- **Next.js 16** (App Router, SPA на `/`) + React 19 + TypeScript, Tailwind 4 + shadcn/ui,
  TanStack Query 5, Zustand, leaflet (карты); UI по-русски, i18n-библиотеки нет.
- **Кастомный сервер `server.ts` под Bun**: в ОДНОМ процессе живут Next.js HTTP,
  socket.io (WS) и раздача `/uploads`. API-роуты Next и WS-шина — один процесс,
  поэтому realtime-события публикуются прямым вызовом `publish()`, без HTTP-моста.
- **Prisma 6 + PostgreSQL** (схема: `prisma/schema.prisma`).
- Аутентификация — свой JWT в cookie `next-auth.session-token` (имя осталось от
  удалённого NextAuth; см. «Авторизация» ниже). Почта — nodemailer, пуш — web-push (VAPID).
- Рантайм — **Bun** (не Node): `bun server.ts`. Turbopack отключён
  (`webpack: true` в `next({ dev, webpack: true })` — воркараунд резолва @prisma/client).

## Команды

```bash
bun server.ts            # dev-сервер целиком (Next + WS + uploads) на :3000
bun run lint             # ESLint (ошибки = 0; предупреждения set-state-in-effect — известный долг)
bun run test / :watch    # vitest — юнит-тесты чистых функций (src/**/*.test.ts, node-env)
SPLIT_TEST_DATABASE_URL=postgresql://… bunx vitest run src/app/api/split  # интеграция API «Сочтёмся» на пустой Postgres с миграциями (без переменной набор пропускается; как поднять — шапка split-api.integration.test.ts)
bun run db:up / db:down  # Postgres в docker (docker-compose.dev.yml)
bun run db:migrate       # prisma migrate dev
bun run db:deploy        # prisma migrate deploy — прод-миграции без dev-цикла (так же стартует контейнер)
bun run db:reset         # prisma migrate reset — СТИРАЕТ dev-базу и накатывает заново
bun run db:generate      # prisma generate (после правок schema.prisma)
bun run db:seed          # сид (Китай), db:admin — сделать юзера админом
bun run db:backfill-photos  # размеры + миниатюры старых фото (сухой прогон; --apply пишет), см. DEPLOY.md §3
bun run build            # production-сборка standalone
```

Тестовые аккаунты (dev, сид): `you@` / `leha@` / `den@triptrek.com`, пароль `1234`.

## Карта репозитория

| Путь | Что там |
|---|---|
| `server.ts` | entry: Next + socket.io + `/uploads`, graceful shutdown |
| `server/` | `ws-auth.ts` (JWT handshake), `socket-handlers.ts`, `rooms.ts` (trip-комнаты), `notification-map.ts`, `static-uploads.ts` |
| `src/app/` | страницы: `/` (весь SPA поездки), `/login`, `/join/[code]`, `/profile`, `/reset-password`, `/admin/*`, **`/split` (хаб; без `?all=1` `middleware` ведёт в последнюю группу), `/split/[groupId]` (`?add=1` — сразу форма траты), `/split/add` (быстрая трата без редиректа), `/split/join`** («Сочтёмся», свой layout с изумрудной темой); `api/` — все бэкенд-роуты (карта: `docs/api.md`) |
| `src/components/trip/` | фичи главного экрана: itinerary, budget/, map/, gallery, board (чат), journal, food/, phrases/, timeline, dashboard/, rest-chill/, profile/, quick-add/, onboarding/… |
| `src/components/split/`, `src/hooks/split/` | «Сочтёмся»: экраны (хаб, группа: Траты/Баланс/Итоги/Ещё, форма траты, расчёт, приглашение) и слой данных (TanStack Query, оптимистичные траты/переводы, свой сокет `use-split-socket`, `use-group-model` — баланс на клиенте). Акцент темы — `<style>` в `app/split/layout.tsx`, не `bg-orange-*` |
| `src/components/admin/`, `auth/`, `ui/` | админка, логин/регистрация, shadcn-кит |
| `src/hooks/trip/` | `use-*.ts` — слой данных клиента (TanStack Query) над API |
| `src/lib/` | серверная логика: `api-auth.ts`, `rate-limit.ts`, `ws-bus.ts`, `ai.ts` (оркестратор ИИ: runAi, учёт AiUsage, алерты трат, aiFailResponse), `ai-usage.ts` (реестр ИИ-фич AI_FEATURES + чистая математика учёта), `ai-key.ts` (BYOK-резолв: pickAiConfig, маски, https-гвард), `planner.ts` (контракты/валидация планера + sanitizeUserText/extractJsonLoose), `poi.ts` (OSM POI через Overpass: парсер, матчинг выбора ИИ), `geocode-place.ts` (Nominatim для черновиков, троттлинг + бюджет времени), `premium.ts`, `notify.ts`, `push-retry.ts` (чистое правило ретрая web-push) и `push-send.ts` (доставка web-push: ретрай, TTL, логи fanout), `logger.ts` (логи), `admin-log.ts` (журнал админ-действий AdminLog), `trip-join.ts` (вступление по инвайт-коду), `mail/`, `storage/`, `budget/` (split/balances/settle + money/personal/planned + `history.ts` — группировка истории трат по дням («Сегодня · $45»), + `people.ts` — «участники денег»: активные не-зрители + все из трат, в т.ч. вышедшие; расчёт долгов обязан идти по `moneyParticipants`, а не по голому `trip.participants`), `outbound.ts`, `db.ts` (Prisma-клиент), `trip-days.ts`, `trip-export.ts`, `pdf/route-pdf.ts` (генерация PDF маршрута: DejaVu-шрифты, переносы, колонтитулы), `photo-exif.ts` (EXIF фото на клиенте: GPS + дата съёмки одним проходом exifr, до загрузки — сервер EXIF выпиливает), `trip-templates.ts`, `app-config.ts`, `zip.ts` (потоковый ZIP STORE без зависимостей + crc32 + zip64, тесты рядом — архив фото публичной страницы `/p/<token>/photos.zip` без потолка на число кадров); доменные модули маршрута: `time-of-day.ts`, `place-fields.ts` (контракт записи Place), `lodging.ts` (жильё: календарные даты-ключи, «сегодня ночуем здесь», ночи без жилья, нормализатор входа `/api/lodgings`), `place-draft.ts`, `route.ts`, `route-threads.ts`, `map-filters.ts`, `map-bus.ts`, `map-layers.ts`, `query-keys.ts`, `place-links.ts`, `onboarding.ts` (шаги welcome-тура и обучалок вкладок + отметки обучения), `photo-pins.ts` (кластеризация фото-меток карты по экранной сетке: чистые функции, тесты рядом), `net.ts` (слабая связь / экономия трафика — для предзагрузки в лайтбоксе), `upload-queue/` (фоновая очередь загрузки фото: `engine.ts` — чистая машина состояний с тестами, `idb-store.ts` — IndexedDB, `browser.ts` — запуск и жизненный цикл страницы (сворачивание, сеть, Wake Lock), `prepare.ts` — сжатие+превью+EXIF+sha256; загрузка фото идёт ТОЛЬКО через `getUploadQueue()`, не прямым POST из формы), `form-draft.ts` (черновики форм FAB в localStorage; хук `use-form-draft`), `key-lock.ts` (последовательное выполнение по ключу в процессе), `back-stack.ts` (кнопка «назад» на телефоне закрывает оверлей, а не сворачивает PWA: история-стек, поверх Next-роутера), `net-guard.ts` (SSRF-гард для адресов от юзера: `checkPublicHostname` без DNS, `checkResolvesToPublic` с резолвом — закрытые сети, IPv6, внутренние зоны; тесты рядом), **`split/`** («Сочтёмся», ADR-0009; чистое ядро с тестами: `split.ts` — деление в центах (`computeShares`), `balances.ts` — баланс и попарные долги, `recurrence.ts`, `stats.ts`, `expense-form.ts`/`expense-view.ts` — логика формы и списка, `input.ts` — нормализация входа API, `activity.ts`/`activity-text.ts` — журнал, `categories.ts`, `money.ts`, `dates.ts`, `fx.ts` — пересчёт валют (чистый; курсы — как у `/api/currency`); серверное: `access.ts` — гарды `requireGroupMember/Owner` + `SPLIT_LIMITS`, `server.ts` — помощники роутов и `deleteSplitGroup`, `serialize.ts`, `notify.ts` — realtime/пуши, `recurring-run.ts`, `fx-server.ts` (живые курсы для шаблонов в иностранной валюте), `last-group.ts` (cookie «последняя группа»: читает и `middleware`, и клиент), `invite-server.ts` (node:crypto — НЕ импортировать из клиента; клиентская часть — `invite.ts`)) |
| `prisma/` | `schema.prisma`, миграции, seed, скрипты переноса |
| `docker-deploy/` | прод: Dockerfile, compose, Caddy, `DEPLOY.md` (runbook), бэкапы |
| `docs/` | `architecture.md`, `api.md`, `glossary.md`, `adr/0001–0009`, `PRODUCTION_PLAN.md`, `audit-*.md` (исторические брифы до релиза: фичи давно реализованы, актуальное описание — в `glossary.md`) |
| `worklog.md` | журнал сессий разработки (что и зачем менялось) — ищи историю там |
| `PATCHNOTES.md`, `SUMMARY-OF-FIXES.md` | исторические сводки фиксов |

## Авторизация (главный паттерн бэкенда)

JWT в cookie `next-auth.session-token`, подпись `NEXTAUTH_SECRET`, 30 дней.
Все API-роуты начинаютcя с одного из гардов **`src/lib/api-auth.ts`**:

- `requireUser(req)` → 401, если нет валидного JWT;
- `requireTripMember(req, tripId)` → 403, если юзер не в TripMember этой поездки (зрителя пускает — он читает);
- `requireTripEditor(req, tripId)` → 403 и для зрителя (role "viewer"): ВСЕ мутационные хендлеры
  поездочных роутов (POST/PATCH/PUT/DELETE) обязаны ходить через него, GET — через requireTripMember;
- `requireTripOwner(req, tripId)` → 403, если не owner;
- `requireAdmin(req)` → 403 (роль **всегда читается из БД**, не из токена).

Смена пароля пишет `User.passwordChangedAt`; JWT с `iat` раньше него отвергается
и в `api-auth`, и в `custom-session` — «выйти на всех устройствах».

## Realtime

API-роут после мутации вызывает `publish(tripId, "place:updated", payload)` из
`src/lib/ws-bus.ts` → socket.io room `trip:<id>` → клиенты инвалидтируют TanStack Query.
События: `trip:updated, place:created/updated/deleted, photo:added/deleted,
expense:added/deleted, budget:updated, board:added/pinned/updated/deleted,
journal:added/updated/deleted, checklist:updated, info:updated, food:updated,
phrase:updated, lodging:added/updated, member:joined`. Канал read-only для клиента (только уведомления);
полный список и механика тостов/пушей — `docs/api.md` («Realtime-события»).
События из NOTIFICATION_MAP дополнительно шлют web-push участникам, кроме автора
мутации — `publish(tripId, event, payload, actorId)`; детали доставки — §9
`docs/architecture.md`.
WS-handshake требует валидный JWT (`server/ws-auth.ts`), анонимов отбиваем.

## Лимиты, премиум, ИИ

- **Rate limit** — in-memory (`src/lib/rate-limit.ts`, ADR-0005): login 20/15мин/IP
  + 8 НЕУДАЧ/15мин на email (`rateLimitBlocked/Record/Reset` — лимит «только неудач»),
  register 3/ч/IP, forgot-password 5/ч/IP, ИИ 10/ч на user+trip. Сбрасывается при
  рестарте контейнера. Шов под Redis оставлен (`limit()`).
- **Премиум**: `isPremiumUser()` (`src/lib/premium.ts`) = `plan === "premium"` и
  не истёк `planExpiry`. Лимиты free (`freeTripLimit`, `freeMemberLimit`) — в
  singleton `AppSettings` через `src/lib/app-config.ts`.
- **ИИ (BYOK)**: все LLM-вызовы — только через `runAi()` (`src/lib/ai.ts`):
  блок админа → лимит фичи → резолв ключа → провайдер → учёт `AiUsage` →
  алерт трат; маппинг ошибок — `aiFailResponse` (429/403/503/502 без дублей).
  Новая ИИ-фича = запись в `AI_FEATURES` (`src/lib/ai-usage.ts`)
  + промпты в роуте; свой fetch/chat-completions в роуте не писать.
  Ключ резолвится по цепочке юзер (свой ключ, опц. свой Base URL/модель) →
  админский из `AppSettings` → `env OPENAI_API_KEY` (`src/lib/ai-key.ts`);
  наружу API отдаёт только маску. OpenAI-совместимый `aiBaseUrl` + `aiModel`.
  Юзерский `aiBaseUrl` — SSRF-поверхность: при сохранении `validateAiBaseUrl` режет
  закрытые хосты, перед вызовом (`runAi`, `ai-key-check`) `checkProviderHost` резолвит
  DNS (`cfg.userBaseUrl`); админский/env адрес доверенный. Любой новый адрес от юзера,
  по которому ходит сервер, — через `net-guard.ts`.
  Задел на будущее: поле `access` в `AI_FEATURES` (премиум-гейт) и сериализация
  сообщений в одном месте (vision). Не через `outbound.ts` — ретраи платных
  вызовов не нужны, нужны HTTP-статус и `redirect:"error"`.
- **Генерация с реальными данными**: всё, что ИИ «предлагает как место», —
  через `src/lib/poi.ts` (Overpass: ИИ выбирает из списка, `matchPicksToPois`
  отбрасывает выдумки) и `src/lib/geocode-place.ts` (Nominatim по `nameEn`,
  троттлинг 1.1с + бюджет времени). Имена/города участников — в промпт только
  через `sanitizeUserText` (`planner.ts`); свободный JSON LLM — только через
  `extractJsonLoose`. В поездку черновики попадают батчем
  (`POST /api/places/batch`) и только после явного подтверждения юзера.
- **Внешние HTTP** (Nominatim, Open-Meteo, курсы валют) — только через
  `src/lib/outbound.ts` (таймаут + ретрай + TTL-кэш, null при неудаче).

## Рецепты (как тут принято делать)

- **Новый API-роут**: `src/app/api/<name>/route.ts`; первым делом гард из api-auth;
  zod для входа; мутации пишут в Prisma и зовут `publish()`; `src/lib/logger.ts` для логов.
  Примеры-образцы: `api/places/route.ts`, `api/checklist/route.ts`.
- **Новая фича на клиенте**: компонент в `src/components/trip/` + хук
  `src/hooks/trip/use-*.ts` (TanStack Query, queryKey включает tripId) + таб в
  `trip-store.ts`. Не ходи в fetch напрямую из компонентов. Новый модальный
  оверлей — сразу `useBackDismiss` (`src/hooks/use-back-dismiss.ts`): «назад»
  на телефоне должен закрывать его, а не сворачивать приложение; общие шиты
  (`MobileBottomSheet`, ui-кит Dialog/Sheet/AlertDialog) уже подключены.
- **Смена схемы**: правка `prisma/schema.prisma` → `bun run db:migrate`.
- **Фото с клиента**: выбор из галереи/камеры → `getUploadQueue()` (`stage`/`addPrepared`/`commit`),
  не `fetch("/api/photos")` из компонента: очередь переживает закрытие шита и приложения, ретраит,
  дедупит и вставляет принятые кадры в кэш галереи. Подробности — `docs/architecture.md` §6.
  Мутации «быстрого добавления» (трата, заметка) — оптимистичные + черновик (`useFormDraft`).
- **Файлы** (аватары, фото, скриншоты): только через `src/lib/storage/` — sharp,
  лимиты, `UPLOADS_ROOT`; `/uploads` в проде отдаётся мимо Next
  (`server/static-uploads.ts`), потому что том докера не попадает в standalone-сборку.
- Комментарии в коде пишутся **по-русски** и объясняют «почему», а не «что».
  Соблюдай стиль существующих файлов.

## Грабли (проверено болью)

- **«Сочтёмся» (`src/lib/split`, `/split`)**: суммы — только целые центы (`parseAmountToCents` на границе ввода, `formatCents` на выводе), доли — только через `computeShares`;
  ссылки в тратах — на `SplitMember.id`, не на `User.id`; группу удаляет только `deleteSplitGroup` (каскад Postgres падает об FK на участников — поймано интеграционным тестом);
  клиентский код не должен импортировать модули с `node:*` (`invite-server.ts`, `server.ts`) — webpack не собирает их для браузера; новая правка денег = тест в `src/lib/split/*.test.ts`.

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
  (`canvas.tsx`, `icons.ts`, `route-threads.tsx`, `photo-pins.tsx`) и `map-picker-client.tsx`. Компонентам карты
  нужен полёт — проси у `MapCanvasHandle` (focusOn/fitPoints/flyToPoints/zoomBy/getCenter).
- Вкладка «Карта» живёт между переключениями: `page.tsx` держит `TripMap` смонтированным и
  прячет `display:none` (флаг `mapEverOpened` в trip-store), иначе пересоздание Leaflet-инстанса
  подвешивает каждый возврат на вкладку. При скрытой вкладке полёты копятся в очереди `MapCanvas`
  (проп `active`), на возврат — `invalidateSize` + сброс очереди. Не «упрощай» обратно до
  условного рендеринга.

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
(деплой/наблюдаемость), `0009` («Сочтёмся»: отдельные модели, центы, участник = SplitMember).
