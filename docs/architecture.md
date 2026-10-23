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
  `budget/`, `map/`, `food/`, `phrases/`, `dashboard/`, `rest-chill/`, `profile/`,
  `quick-add/`, `onboarding/` (общий каркас welcome-тура и обучалок, §7).
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
Инвалидации тяжёлых ключей в `use-websocket.ts` идут через настоящий дебаунс
(пауза 500 мс, но не дольше 4 с от первого события; ключи дедуплицируются по
содержимому): burst событий (загрузка N фото = N `photo:added`) схлопывается в одну
волну рефетчей. Раньше таймер ставился от первого события и не сдвигался — на потоке
событий рефетчи (до 1000 фото с join'ами, карта, маршрут) шли каждые 400 мс у каждого
участника. Пока идёт СВОЯ загрузка фото (`isUploadBusy()`), эхо собственных
`photo:added` не рефетчится вовсе: очередь сама кладёт принятые кадры в кэш галереи
и делает один рефетч по опустошении (§6). Reconnect бесконечный (backoff до 30 c) — realtime не умирает после
сетевой паузы (аудит перфоманса 2026-09-13).

События (полный актуальный список — `grep -rn "publish(" src/app/api`):
`trip:updated`, `place:created|updated|deleted`, `photo:added|deleted`,
`expense:added|deleted`, `budget:updated`, `board:added|pinned|updated|deleted`,
`journal:added|updated|deleted`, `checklist:updated`, `info:updated`,
`food:updated`, `phrase:updated`, `member:joined`. Для событий из
`NOTIFICATION_MAP` `ws-bus.ts` попутно издаёт в комнату мета-событие
`notification` (тост) и web-push (§9); остальные события — тихая инвалидация.

«Сочтёмся» (ADR-0009) использует тот же socket.io, но другие комнаты — `group:<id>` (`publishRoom`/`evictUserFromRoom` в
`ws-bus.ts`, обработчики `split:join|leave` в `server/socket-handlers.ts`) и одно событие `split:changed` на любую правку группы;
клиентский хук — `src/hooks/split/use-split-socket.ts` (свой сокет: страницы `/` и `/split` не смонтированы одновременно).

Правила: WS-канал отдаёт только «что-то изменилось» (payload минимален или пуст),
истину клиент добирает через API. Новое событие = добавить publish в роут +
инвалидацию в хук + строку в `server/notification-map.ts` (если нужен колокольчик).

Гарантии доступа (hardening 2026-09-12): handshake повторяет HTTP-инварианты —
JWT + существование юзера + `passwordChangedAt` (токен до смены пароля WS не
проходит). CORS сокетов: явный `WS_ALLOWED_ORIGINS` (список или `*`), иначе —
только origin из `NEXTAUTH_URL` (`wsAllowedOrigins` в `server.ts`). Удаление
TripMember (исключение/бан/выход/админ) обязано звать
`evictUserFromTrip(tripId, userId)` из `ws-bus.ts` — иначе открытая вкладка
исключённого продолжала бы получать события комнаты.

## 5. Модель данных (Prisma / Postgres)

Схема: `prisma/schema.prisma`, все связи каскадные от Trip. Ядро:

```
User ──< TripMember >── Trip ──< Day ──< Place ──< Photo
              │            │  ├──< Photo, Expense, JournalEntry
              │            │  ├──< BoardMessage (чат, replies, reactions-JSON)
              │            │  ├──< ChecklistItem, InfoItem, Phrase, FoodItem
              │            │  ├──< Lodging (проживание: заезд/выезд, бронь, цена)
              │            │  └──< BudgetPlan (уникален по tripId+category)
              │            └──< TripBan (бан юзера в конкретной поездке)
   глобальное: AppSettings (singleton id="app"), AdminLog,
               InviteCode (бета-коды регистрации приложения),
               PushSubscription, UserNotification, PasswordResetToken, Feedback,
               AiUsage (учёт вызовов ИИ: feature/keySource/токены, без промптов)
```

«Сочтёмся» — отдельный контур данных, не связанный с Trip (ADR-0009):

```
User ──< SplitMember >── SplitGroup ──< SplitExpense ──< SplitShare
              (userId = null — участник без аккаунта)  ├──< SplitPayment
                                                       ├──< SplitRecurring
                                                       └──< SplitActivity (журнал)
```

Соглашения, которые легко сломать:

- **Expense**: `amount` — всегда в **USD** (единая валюта хранения, `BASE_CURRENCY` в
  `src/lib/currencies.ts`, решение владельца 2026-10-22; бюджеты и `Place.budget` — тоже USD,
  сервер принимает `Trip.currency` только USD). То, что ввёл юзер, —
  `originalAmount`/`originalCurrency`; формы пересчитывают в USD по курсу и без курса не отправляют
  (`lib/budget/convert.ts`, `useRateFor`). Делёж — `splitWith` (строка с userId через
  запятую, пусто = личная) + `excludeSelf`; вход POST нормализует `normalizeExpenseInput`
  (`lib/budget/expense-input.ts`: дубли и плательщик в `splitWith`, известная категория, форма перевода).
  Переводы-погашения идемпотентны по `settlementKey` (уникальный **в рамках поездки**,
  `@@unique([tripId, settlementKey])`; формат в схеме) — поэтому одну пару долгов можно гасить
  многократно. Перевод не может быть больше реального долга пары (`checkSettlementAgainstDebt`,
  проверка в сериализуемой транзакции; иначе 409) — «Перевели» с двух устройств не создаёт встречный долг.
  Логика дележа/долгов — `src/lib/budget/` (split, balances,
  settle; money — целые центы и округления, personal — «модель реальных денег»
  для «Моё», planned — план бюджета по местам маршрута), не дублируй её в роутах.
- **Split\*** («Сочтёмся»): деньги — целые центы (`amountCents`, `SplitShare.cents`), валюта группы одна (`SplitGroup.currency`,
  без пересчёта), Σ долей = сумме траты (инвариант держит `computeShares`, `src/lib/split/split.ts`; режимы equal/exact/shares/percent,
  режим и веса хранятся для правки). Все ссылки — на `SplitMember.id`, не на `User.id`: выход/исключение мягкие (`status`), строка
  с историей не удаляется (FK без каскада), безаккаунтного (`userId = null`) занимает друг через «Это я» (`POST /api/split/join`).
  Дата траты — `@db.Date` (ключ `ГГГГ-ММ-ДД`, `src/lib/split/dates.ts`). Перевод — отдельная `SplitPayment` с `clientKey`.
  Валюта: `amountCents` всегда в валюте группы; введённое в другой валюте — `originalAmountCents`/`originalCurrency` (парой, CHECK в БД), пересчёт — `src/lib/split/fx.ts` (курсы `/api/currency`, «единиц за 1 USD»; нет курса → null, не «курс 1»). Шаблон в иностранной валюте пересчитывается сервером по живому курсу (`fx-server.ts`).
  Баланс и попарные долги считает клиент (`src/lib/split/balances.ts`, чистые функции с тестами), хаб — SQL-агрегатами.
  Повторяющиеся траты создаются лениво при чтении (`recurring-run.ts`, уникальный `(recurringId, recurringPeriod)`; удалённый
  период — в `skippedPeriods`). Группа удаляется ТОЛЬКО через `deleteSplitGroup` (`src/lib/split/server.ts`): каскад Postgres
  ломается об FK на участников. Права — любой активный участник правит траты (всё в `SplitActivity`); владелец — валюта,
  исключение, удаление.
- **Lodging** — жильё как отдельная сущность, а не `Place` категории hotel: маршрут
  описывает «что делаем», жильё — «где ночуем». `checkIn`/`checkOut` — КАЛЕНДАРНЫЕ дни
  без пояса: в БД полдень UTC выбранного дня (так день не прыгает между поясами
  сервера и клиента), везде в коде работаем с ключами `ГГГГ-ММ-ДД` (`src/lib/lodging.ts`).
  Ночь дня `checkOut` уже не в этом жилье (полуинтервал `[checkIn, checkOut)`), поэтому
  жильё «встык» не пересекается. «Где ночуем сегодня» и «ночи без жилья» считает
  `lodging.ts`, не дублируй в компонентах.
- **User.paymentDetails** — «куда возвращать долги» (карта/телефон, ≤300): видят
  только участники его поездок (participants в `GET /api/trip`), в публичные
  выгрузки не отдаётся. **Trip.shareEnabled/shareToken** — публичная страница
  `/p/<token>` («живой журнал»: фото/маршрут/карта, без денег/чата): токен 32 hex,
  rotate закрывает старую ссылку, страница RSC без кэша — выключение мгновенное.
  **Trip.shareAllowDownload** — тумблер «гости могут скачать ZIP фото»
  (`/p/<token>/photos.zip`); **Trip.shareHearts** — счётчик гостевых сердечек
  (`/p/<token>/heart`, анонимно + лимит по IP).
- **Photo**: `url`/`thumbUrl` (storage пайплайн), `width`/`height` — размеры сохранённого файла после EXIF-поворота (из них клиент строит `aspect-ratio` плитки; у фото до этой правки заполняет `prisma/backfill-photos.ts`), координаты и дата съёмки из EXIF (клиентский `src/lib/photo-exif.ts`, до загрузки — storage EXIF выпиливает; `takenAt` — по EXIF-дате, иначе время загрузки),
  `userId` — кто загрузил (SetNull при удалении аккаунта).
- **Phrase**: колонки `ru`/`cn`/`pinyin` исторические; реальный язык — `language`
  (код: zh, ja, fr…). null у записей до миграции.
- **FoodItem**: голоса «хочу попробовать» — `wantedBy` (JSON-строка массива userId).
- **BoardMessage.reactions** — JSON-строка `{"👍":["userId",…]}`.
- **TripMember.role** — owner / member / **viewer**: зритель — read-only друг
  (смотрит маршрут/галерею/бюджет, не мутирует — мутационные роуты за
  `requireTripEditor`; free-лимит участников не считает зрителей). Переключает
  владелец в «О поездке» (PATCH /api/participants/[id] c ролью).
- **Trip.allowMemberInvites** — политика приглашений: `true` (дефолт) — код видят
  все участники, `false` — только владелец (GET /api/trip прячет `inviteCode`,
  join по коду не меняется). Переключается владельцем из «О поездке»
  (PATCH /api/trip).
- **AppSettings** — singleton-строка `id="app"`; до первой записи её нет, тогда
  действуют дефолты кода (`src/lib/app-config.ts`): registrationEnabled,
  freeTripLimit=1, freeMemberLimit=5, общий ключ ИИ. Бета-гейты и витрина лендинга:
  `inviteRequired` (регистрация только по коду), `demoTripToken` («Живой пример»
  на лендинге — токен публичной поездки), `contactTelegram` (футер лендинга и /login).
- **InviteCode** — инвайт-код приложения (бета-доступ на регистрацию аккаунта;
  не путать с `Trip.inviteCode` — он приглашает в конкретную поездку). `usedCount` —
  авторитетный счётчик использований; слот занимается атомарным условным
  `updateMany` (`usedCount < maxUses`, не истёк, не деактивирован) в
  `api/auth/register` — двойная регистрация по одному коду невозможна без гонок.
  Генерация/нормализация/статус — `src/lib/invite-code.ts`, выдаёт и гасит коды
  админка (`/api/admin/invites`, AdminLog `invite.create`/`invite.deactivate`).
- Текущий день поездки — только `calculateCurrentDayNumber` из
  `src/lib/trip-days.ts` (формула уже расходилась между роутами — не дублируй).
  Номер дня зажат в `[0..totalDays]`, поэтому после финиша «текущим» остаётся последний
  день: подписи «сегодня» гасим через `isTripOver(endDate)`, а сам кламп оставляем —
  на нём держатся дефолтные дни в формах.
- Бюджет места (`Place.budget`) принимается в диапазоне `0..MAX_PLACE_BUDGET`
  (`src/lib/place-fields.ts`), вне диапазона значение отбрасывается нормализатором.

## 6. Файлы и фото

`src/lib/storage/` — единый пайплайн загрузок: sharp (сжатие, превью),
`UPLOADS_ROOT` (`storage/root.ts`), лимиты размеров, пути `/uploads/<scope>/...`.
Используется для фото, аватаров, скриншотов фидбека. В проде файлы живут на
докер-томе `triptrek-uploads`; их раздаёт `server/static-uploads.ts` до Next
(в standalone-сборку рантайм-файлы не попадают). Решение «локальный диск вместо
S3» — ADR-0003.

**Фото на телефоне (90% пользователей)** — правила, чтобы «не грузило всё сразу»:

- Загрузка отдаёт `url` (≤1600px) + `thumbUrl` (480px) + `width`/`height`; миниатюру и размеры
  считают общие `makeThumb`/`imageDisplaySize` в `storage/index.ts` (их же использует
  backfill-скрипт, чтобы политика не расходилась).
- Плитки галереи и публичной страницы обязаны ставить `aspect-ratio` из `width`/`height`: без
  него masonry считает каждую плитку заглушкой 120px, ленивая подгрузка тянет ~вдвое больше
  картинок, чем видно, а колонки прыгают на каждой загрузке. Старые фото без размеров
  подхватывает `bun prisma/backfill-photos.ts` (`DEPLOY.md` §3).
- Список плиток рендерится порциями (галерея — 60 + «Показать ещё», публичная «Все фото» — 60);
  плитки мемоизированы (`gallery-tile.tsx`), framer-motion — только у первых 10.
- Лайтбокс: слайды мемоизированы (не пересобираются на свайп); на слабой связи / в режиме
  экономии трафика (`src/lib/net.ts`) соседние кадры не предзагружаются.
- **Загрузка фото живёт не в шите, а в фоновой очереди** (`src/lib/upload-queue/`, ретро
  2026-10-22: «грузил 100 фото, свернул — часть пропала»). Раньше очередь держалась на
  смонтированном `PhotoBatch`: закрытие шита, смена вкладки, сворачивание или падение
  страницы обрывали её молча, превью сетки были полноразмерными оригиналами (сотня кадров =
  вылет вкладки на телефоне), а «Загрузить» разрешалось только после подготовки всех кадров.
  Устройство теперь такое:
  - `engine.ts` — чистая машина состояний без DOM/fetch/IndexedDB (зависимости
    подставляются; покрыта `engine.test.ts`): конвейер «подготовка (2 кадра параллельно) →
    отправка (3 параллельно)», ретраи с экспоненциальным отступом, пауза всей очереди на
    офлайн / 429 (`Retry-After`) / 401, дубли по sha256 (до отправки — по кэшу галереи и
    очереди; 409 сервера = успех, а не ошибка), «пуш один на пачку» (`silent` у всех кроме
    последнего неотправленного, `count` = размер пачки).
  - `idb-store.ts` — IndexedDB (`jobs` + `blobs`): подготовленные кадры (~70–300 КБ) и
    метаданные переживают закрытие приложения; при старте (`startUploadQueue` в `app-shell`)
    очередь поднимается и дошлёт недоотправленное. Задания хранят `userId` — на общем
    телефоне чужая очередь не уйдёт от имени другого аккаунта. Нет IndexedDB / квота —
    очередь работает из памяти и честно говорит об этом (`persistent=false`).
  - `browser.ts` — обвязка жизненного цикла: `visibilitychange`/`pageshow` (после долгого
    сворачивания висящие запросы рвутся и идут заново — вкладку могли заморозить),
    `online`/`offline` (офлайн не списывает попытки), Wake Lock (экран не гаснет, пока идёт
    загрузка), `navigator.storage.persist()`, `beforeunload` при идущей отправке.
  - Неотправленный выбор («черновик пачки», `committed=false`) тоже хранится (сутки):
    шит открывается сразу на нём, а плашка над FAB зовёт «Не отправлено: N».
  - Превью сетки — отдельная миниатюра 240px (`makeThumbnailBlob`), а не оригинал.
  - UI: плашка/кольцо над FAB и менеджер (`components/trip/upload/`), полоса «Загружается»
    в галерее (`GalleryUploads`). Принятые кадры вставляются в кэш `["photos", tripId, …]`
    прямо из ответа POST (`photo-merge.ts`), а общий рефетч (карта, маршрут, счётчики) — один
    раз, когда очередь опустела. Новая загрузка фото = `getUploadQueue()`, не прямой POST.
  - Сервер: `POST /api/photos` сериализует запросы с одним `contentHash` замком по ключу
    (`src/lib/key-lock.ts`) — иначе повтор/второе устройство проходили проверку дубля раньше,
    чем появлялась запись. Процесс один (ADR-0001), поэтому без уникального индекса.
- **Траты и заметки из FAB** — оптимистичные: форма очищается и шит закрывается до ответа
  сервера, запись уже в списке (`useAddExpense`/`useAddJournal` кладут её в кэш с `tmp-` id);
  не сохранилось — откат кэша, набранное возвращается в черновик (`src/lib/form-draft.ts`,
  localStorage, ключ по поездке и юзеру, TTL 3 дня), тост «Вернуть» открывает форму. Черновик
  пишется с дебаунсом и сразу при сворачивании/`pagehide`, поэтому переживает случайный тап
  по фону шита и смахивание приложения. Автоповтор POST трат/заметок сознательно не делаем:
  у них нет ключа идемпотентности, повтор после потерянного ответа задвоил бы деньги.
- Карта: фото-метки не рисуются по одной на фото. `map/photo-pins.tsx` + `src/lib/photo-pins.ts`
  схлопывают их в ячейки экранной сетки (64px) на текущем зуме и рисуют только то, что в кадре
  (кап 120 меток). Тап по кластеру приближает карту, а снятое в одной точке раскрывается списком.

## 7. Сессии, аккаунты, почта

- Логин: `POST /api/auth/custom-login` (bcrypt, `src/lib/password.ts`) → ставит
  JWT-cookie; клиент ходит в custom-роуты (`custom-login/custom-session/custom-signout`).
  NextAuth удалён (2026-10-22): его Credentials-вход был параллельным неиспользуемым путём,
  а пакет тянул критичную уязвимость. Имя cookie `next-auth.session-token` осталось прежним —
  иначе все сессии разлогинились бы. Лимиты логина: 20/15 мин на IP (все попытки) и 8 неудач
  за 15 мин на email (успех сбрасывает; цена — вход жертвы можно закрыть на 15 мин нарочными ошибками).
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
  Юзерский `aiBaseUrl` проходит SSRF-гард (`src/lib/net-guard.ts`): хост должен быть
  публичным при сохранении и при каждом вызове (DNS-резолв). Не закрыто: DNS rebinding
  между проверкой и fetch — для этого нужен пиннинг IP в собственном HTTP-клиенте.
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
`/api/notifications`), при настроенном VAPID дублирует web-push (`push-send.ts`).
Всё fire-and-forget — сбой пуша не роняет основную операцию; сам push после записи
в БД не awaitится: пуш-сервер из РФ отвечает по 10+ секунд (Google FCM деградирован,
проба 2026-09-24 — каждый 4-й запрос в таймаут), мутация не должна это ждать.

Доставка одного пуша — `deliverPush` в `push-send.ts`: попытка + один ретрай на
транзиентные ошибки (сеть/таймаут/429/5xx — чистое правило в `push-retry.ts`),
TTL сутки (иначе web-push держит недоставленное 4 недели — «вчерашние» приходят
пачкой), исходы в лог (`push: fanout` — итог рассылки, `push: delivery failed` —
потеря). Пуши о событиях поездки не отправляются автору мутации: `actorId`
пробрасывается 4-м аргументом `publish()` (фолбэк — `payload.userId`), его же
клиент использует, чтобы не показывать автору ws-тост (`use-websocket.ts`).
Клиент: `use-push.ts`, `notifications-bell.tsx`.

## 10. Деплой

Один VPS: docker compose (app + Postgres + Caddy), TLS Let's Encrypt, фото на
томе, бэкапы `docker-deploy/backup.sh` (rclone в S3-совместимое хранилище).
Runbook с командами — `docker-deploy/DEPLOY.md`; мотивации — ADR-0001/0002/0003/
0006/0008. Обновление: `git pull && docker compose up -d --build app && docker image prune -f`.
