# Карта API TripTrek

Все роуты — `src/app/api/**/route.ts` (App Router). Документ-карта: что где лежит,
кто может вызвать, какие лимиты. Роли участников: owner / member / **viewer**
(зритель — read-only друг: все GET через `requireTripMember` пускают его,
любые мутации — через `requireTripEditor` и получают 403; слот free-лимита
участников зритель не занимает, переключает роль владелец в «О поездке»).
кто может вызвать, какие лимиты. Скелет роута и правила — [architecture.md](architecture.md#3-backend-api-роуты).

## Уровни доступа

| Метка | Гард (`src/lib/api-auth.ts`) | Смысл |
|---|---|---|
| 🌐 | — | публичный (анонимный доступ разрешён) |
| U | `requireUser` | любой залогиненный |
| M | `requireTripMember` | участник поездки (TripMember: owner или member) |
| O | `requireTripOwner` | владелец поездки |
| A | `requireAdmin` | `User.role === "admin"` (роль всегда из БД) |
| G | `requireGroupMember` (`src/lib/split/access.ts`) | активный участник группы «Сочтёмся» (вышедший/исключённый и посторонний — одинаковый 403) |

Ответы гардов: 401 `Unauthorized`, 403 `Forbidden` / `Not a member of this trip` /
`Only trip owner can do this`.

Идентификация пользователя — JWT в cookie `next-auth.session-token` (30 дней;
смена пароля инвалидирует старые токены через `passwordChangedAt`).

## Auth и аккаунт

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `auth/custom-login` | POST | 🌐 | 20/15 мин/IP + 8 неудач/15 мин/email | логин (bcrypt), ставит JWT-cookie; проверяет Origin (NEXTAUTH_URL) и Content-Type: application/json (login-CSRF) |
| `auth/custom-session` | GET | 🌐 | — | текущая сессия (учитывает `passwordChangedAt`); в `user` входит `onboardingCompletedAt` (null = показать обучение) |
| `auth/custom-signout` | POST | 🌐 | — | выход (снимает cookie) |
| `auth/register` | POST | 🌐 | 20/ч/IP | регистрация + welcome-письмо; проверяет `registrationEnabled`; значок профиля `emoji`/`color` принимает только из списков `avatar-presets.ts`, иначе дефолт схемы; email канонизируется (trim+lowercase); при `inviteRequired` требует инвайт-код приложения (`InviteCode`, слот атомарный); вступление в поездку — только через `trips/join` по коду |
| `auth/register-options` | GET | 🌐 | 60/мин/IP | публично; режим регистрации + контакт для связи (`registrationEnabled`, `inviteRequired`, `contactTelegram`). Форма /login его больше не дёргает: те же данные серверная `login/page.tsx` берёт из `getPublicShowcase()`; роут оставлен для внешних клиентов |
| `support` | GET | 🌐 | 60/мин/IP | публично; реквизиты блока «Поддержать» внизу профиля: `{ donationAlertsUrl, webmoneyPurse }` (оба nullable, валидируются при чтении; задаются в админке → Настройки → Поддержка) |
| `auth/forgot-password` | POST | 🌐 | 5/ч/IP (+3/ч/email) | одноразовый токен (sha256 в БД, TTL 60 мин) + письмо; анти-перечисление |
| `auth/reset-password` | POST | 🌐 | 20/ч/IP | сброс по токену, инвалидирует сессии |
| `user` | GET, PATCH | U | — | свой профиль (имя, emoji, цвет, аватар, ИИ-ключ); PATCH принимает также `onboardingCompleted`: true — обучение пройдено/пропущено, false — сброс («Пройти заново» в профиле); `paymentDetails` (строка ≤300 / null) — «куда возвращать долги», видят участники поездок в `GET /api/trip` participants |
| `user/password` | POST | U | userRateLimit | смена пароля → инвалидация всех сессий |
| `user/avatar` | POST | U | userRateLimit | аватар (через `src/lib/storage`) |
| `user/upgrade` | POST | U | — | переход на premium (ручной сценарий; известная заглушка) |
| `user/ai-key-check` | POST | U | userRateLimit | проверка ТОЛЬКО своего BYOK-ключа у LLM (общий не трогается), наружу — только маска; юзерский `aiBaseUrl` перед запросом проверяется на SSRF (`net-guard`) |
| `limits` | GET, POST, PATCH | U / M | — | лимиты плана юзера (maxTrips/maxMembers: free из `AppSettings`, premium = ∞) |

## Поездки и участники

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `trips` | GET, POST | U | — | список своих поездок / создание (проверяет freeTripLimit); POST сразу создаёт `totalDays` дней (до 60, `buildInitialDays`: город = направление, даты от старта, `endDate` = конец последнего дня), иначе быстрое добавление отвечало «Нет дней в маршруте» |
| `trips/[tripId]` | GET, PATCH, DELETE | M / O | — | карточка поездки; правка — M (частично O), удаление — O |
| `trips/[tripId]/members/[memberId]` | PATCH | M(owner) | — | роль/имя участника, передача владения (ownership → уведомление) |
| `trips/join` | GET, POST | U | 30/мин/IP + userRateLimit | превью поездки по инвайт-коду / вступление (проверяет TripBan, freeMemberLimit) |
| `trips/from-template` | POST | U | — | создать поездку из шаблона (`src/lib/trip-templates.ts`) |
| `trip` | GET, PATCH | M / O | — | сводка поездки: участники, счётчики, дни-мета БЕЗ мест (слим-формат, аудит 2026-09-13); `email` участников — только владельцу; `formerParticipants` — вышедшие/исключённые, чьи id остались в тратах (для расчёта долгов); `settings.budgetSource` — `members` (общий бюджет = сумма личных, зрители не в счёт) или `trip`; при `allowMemberInvites:false` `inviteCode` отдаётся только владельцу; дни с местами — `route`; PATCH — только владелец: `{status}` и/или `{title}` и/или `{allowMemberInvites:boolean}` (переключатель «кто приглашает» из «О поездке») |
| `trip/share` | GET, POST | O | — | публичная страница поездки `/p/<shareToken>` («живой журнал»: обложка, лучшие кадры, главы-дни, галерея, карта — без денег/чата/дневника). GET — `{enabled, token, allowDownload, expiresAt, expired}`; POST `{enabled?, rotate?, allowDownload?, expiresInDays?}` — включить/выключить ссылку, перегенерировать токен (rotate мгновенно закрывает старую), тумблер скачивания фото гостями (независим от enabled), срок действия: `expiresInDays` 1/7/30/90 суток от сейчас или `null` — бессрочно (остальное → 400; токен при истечении не меняется — продлил, и ссылка снова работает). Истёкшая ссылка: страница показывает «срок действия закончился», `photos`/`photos.zip`/`heart` отвечают 404 — единое условие в `src/lib/public-share.ts` (`activeShareWhere`). Страница — RSC `src/app/p/[token]/page.tsx`, ходит в БД по токену без кэша; `generateMetadata` отдаёт og:image с обложкой (превью в мессенджерах); noindex |
| `p/[token]/photos.zip` | GET | публичный | 5/ч/IP | ZIP всех фото поездки без потолка на число кадров (zip64 в `src/lib/zip.ts` снимает классические 4 ГБ / 65535 записей; STORE без сжатия — JPEG уже сжат; поток, в памяти один файл). Работает только при `shareEnabled` + `shareAllowDownload`; 404/403 иначе. Внутри имена `NNN-день-N-подпись.jpg` в хронологии `takenAt` |
| `p/[token]/photos` | GET | публичный | 60/ч/IP | порции фото публичной страницы: SSR (page.tsx) отдаёт первые 200, клиент докачивает остальное отсюда. порядок — по ходу поездки: `[день ↑, takenAt ↑, id ↑]` (день первым ключом: у фото без EXIF `takenAt` — время загрузки, поэтому по нему одному кадры дня 2, загруженные позже дня 5, уехали бы в конец; `src/lib/public-photos.ts`). `?cursor=<день>~<takenAt ISO>~<id>` — keyset (курсор не зависит от существования строки — фото могли удалить между запросами; первый курсор считает сервер и кладёт в SSR-пропс `photosNextCursor`), до 500 за раз; ответ `{ photos, nextCursor }`, `nextCursor: null` — это всё |
| `p/[token]/heart` | POST | публичный | 10/ч/IP | гостевое сердечко-переключатель: `{}` → `shareHearts += 1`, `{undo:true}` → −1 (не ниже 0, ответ `{hearts, undo:false}` если забирать нечего). Анонимно; состояние «моё сердечко» — localStorage на устройстве |
| `trip/dates` | PATCH | O | — | сдвиг дат/дней поездки |
| `trip/budget` | PATCH | M | — | общий бюджет поездки (конечное число 0…1e9); показывается, только если личные бюджеты не заданы у всех не-зрителей (`settings.budgetSource` в `trip`) |
| `trip/import` | POST | U | userRateLimit | импорт JSON-бэкапа → новая поездка; тело ≤ 20 MB (413), битый бэкап → 400, транзакция до 60 с; переводы (settlement) не переносятся, делёж трат чистится от id прежних участников (трата становится личной импортёра), валюта всегда USD |
| `import` | POST | O | userRateLimit 10/ч + кап 5MB | импорт в существующую поездку (owner); tripId — только в query, тело парсится после гарда и лимита; траты: переводы и нулевые суммы пропускаются, делёж ограничивается текущими участниками |
| `export` | GET | O | — | экспорт поездки в JSON (`src/lib/trip-export.ts`); полный дамп — функция владельца, участникам 403 |
| `export/pdf` | GET | M | — | маршрут поездки одним PDF-файлом (офлайн, `src/lib/pdf/route-pdf.ts`); tripId — в query; любой участник поездки; 400, если нет мест |
| `participants` | GET, PATCH | M / U | — | участники поездки; PATCH — профиль «себя в поездке» (displayName/emoji) |
| `participants/[id]` | PATCH, DELETE | M(owner) | userRateLimit | правка/удаление участника (удаление → уведомление) |
| `participants/leave` | POST | U | userRateLimit | выйти из поездки |
| `participants/debts` | GET | M / M(owner для чужих) | 60/мин | незакрытые долги участника (`?userId=`, по умолчанию свои) — только для предупреждения в диалогах выхода/исключения/бана; не блокирует |
| `participants/ban` | POST, GET, DELETE | M(owner) / U | userRateLimit | бан/разбан юзера в поездке (TripBan) |
| `search` | GET | M | — | поиск по объектам поездки; сравнение строк в JS (кириллица/иероглифы) |

## Контент поездки (все — M)

| Роут | Методы | WS-событие | Что делает |
|---|---|---|---|
| `route` | GET | — | модель чтения маршрута: дни+места+мета поездки одним запросом (`useRoute`); единственный источник дней с местами — дашборд, лента и галерея тоже читают его через `useRouteDays` |
| `days` | POST, PATCH, DELETE | `trip:updated` | мутации дней (город, даты); GET удалён (аудит 2026-09-13) — читайте `route` |
| `places` | POST | `place:created` | новое место (день, координаты, категория) |
| `places/batch` | POST | `place:created` (одна публикация с count) | батч-создание до 30 мест из черновиков ИИ (планер/рестораны/прогулка); все dayId — своей поездки |
| `places/[id]` | PATCH, DELETE | `place:updated/deleted` | правка/удаление места, статус visited |
| `places/reorder` | POST | `place:updated` (без тоста) | порядок мест внутри дня (drag&drop в карточке дня): полный список id дня одной перестановкой; `order` — серверное поле, обычный PATCH его не пишет |
| `photos` | GET, POST, DELETE | `photo:added` | галерея; POST — загрузка файла (storage); клиент читает EXIF до отправки (`src/lib/photo-exif.ts`: GPS + дата съёмки) и передаёт `takenAt` (ISO; мусор/будущее → время загрузки), `lat`/`lng`; клиент считает sha256 оригинала (`src/lib/photo-hash.ts`) и шлёт `contentHash` — повтор кадра в поездке отклоняется **409** «Это фото уже загружено» (дедуп вечерних батчей; очередь клиента считает 409 успехом, параллельные POST с одним `contentHash` идут по очереди через `withKeyLock`, чтобы не создать двойник); отправляет клиент только из фоновой очереди (`src/lib/upload-queue/`), с таймаутом и ретраями; 429 несёт `Retry-After`, очередь на это время встаёт на паузу; батч-загрузка помечает все кадры кроме последнего `suppressPush=1`, последний несёт `count=N` — друзья получают один пуш «добавил N фото» (publish optы silent, см. ws-bus); GET отдаёт `place` проекцией {name, lat, lng}; в ответах `width`/`height` — размеры файла (aspect-ratio плитки; у старых фото `null` до `prisma/backfill-photos.ts`); защита диска: не больше `PHOTO_LIMIT_PER_TRIP` (1500) фото в поездке → 413 (постоянный отказ очереди), свободно меньше `PHOTO_MIN_FREE_MB` (1024) → 507 (очередь повторит позже) |
| `photos/[id]` | PATCH | `photo:added` | подпись/день/избранное; `hiddenFromPublic: boolean` — скрыть кадр от гостей публичной страницы (автор или владелец; в самой поездке фото видно как раньше) |
| `photos/geo` | GET | — | фото с координатами для карты: селект маркерных полей, кап 1000 |
| `expenses` | GET, POST, DELETE | `expense:added` | траты, делёж (`src/lib/budget/`), погашения (settlementKey); POST нормализует вход (дубли/плательщик в `splitWith`, категория из списка, 1 получатель у перевода), перевод больше реального долга → 409 (сериализуемая транзакция); GET отдаёт все траты поездки (страховочный потолок 5000) |
| `budget-plan` | GET, PATCH | `budget:updated` | плановый бюджет по категориям (категория из справочника, сумма 0…1e9) |
| `board` | GET, POST, PATCH, DELETE | `board:added` | чат поездки (реакции JSON, ответы, pin) |
| `journal` | GET, POST, PATCH, DELETE | `journal:added` | дневник (запись на день, mood) |
| `checklist` | GET, POST, PATCH, DELETE | `checklist:updated` | чек-лист подготовки |
| `info` | GET, POST, PATCH, DELETE | `info:updated` | справка (визы, сим-карты…) |
| `lodgings` | GET, POST, PATCH, DELETE | `lodging:added` (POST), `lodging:updated` (PATCH/DELETE) | проживание: заезд/выезд, адрес на местном языке, бронь, телефон, цена. Вход нормализует `src/lib/lodging.ts` (`pickLodgingInput`), даты — ключи `ГГГГ-ММ-ДД`; чтение — участник, правка — редактор (не зритель); ≤200 записей на поездку |
| `phrases` | GET, POST, PATCH, DELETE | `phrase:updated` | разговорник (ru/cn/pinyin, language) |
| `foods` | GET, POST, PATCH, DELETE | `food:updated` | гастрогид (голоса wantedBy) |
| `nearby` | GET | — | что рядом (внешние API через outbound) |

## Внешние данные и утилиты

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `geocode` | GET | U | — | Nominatim через `outbound.ts` |
| `city-search` | GET | 🌐 | rateLimitMiddleware | автодополнение городов (`src/lib/city-coords.ts` + Nominatim) |
| `weather` | GET | 🌐 | — | Open-Meteo (публично: панель погоды без сессии не ломает UX) |
| `currency` | GET | 🌐 | rateLimitMiddleware | курсы open.er-api.com (`src/lib/currencies.ts`); `approxCodes` — коды, чей курс взят из статичной таблицы (формы показывают «курс приблизительный»), `fallback` — API недоступен целиком |
| `health` | GET | 🌐 | — | `{"status":"ok","db":"up"}` — для мониторинга/uptime |

## ИИ

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `ai-summary` | POST | M | 10/ч на user+trip | итоги поездки (LLM); без ключа вовсе — локальный черновик (`generated:false`), сбой провайдера — 502 «попробуй ещё раз» (не подменяется черновиком), заблокирован юзер — 403 |
| `phrases/generate` | POST | M | 10/ч на user+trip | базовый разговорник по направлению |
| `phrases/ai` | POST | M | 10/ч на user+trip | фразы по свободному запросу (3 режима: translate/more/pack) |
| `foods/suggest` | POST | M | 10/ч на user+trip | блюда города: `count` 4–10 (пакет «Подборка шефа» в Еде); город свободного ввода проверяется Nominatim'ом (`findCity` в `geocode-place.ts`) — 400 «не нашли город», если это не place/boundary (недоступный Nominatim не блокирует) |
| `ai/planner` | POST | M | 3/ч на user+trip | черновик маршрута ИИ (mode trip/day/replace) по **существующим** дням; в промпт уходят координаты существующих мест дня (якорь «рядом с отелем»), после геокодинга далёкие места получают `farWarning` («≈N км от остальных мест дня»), итог — в `geoNote`; пустой день: по «Пожеланиям», без них — просто лучшие места города (позиционирование фичи — подборка мест на выбор, не готовый маршрут); геокодирование Nominatim по nameEn, `fail` → «уточнить на карте» |
| `ai/restaurants` | POST | M | 6/ч на user+trip | реальные заведения OpenStreetMap у города дня; ИИ только отбирает — имена/координаты из OSM (`matchPicksToPois`); опц. `preferences` — свободные пожелания (санитайзятся, главный фильтр отбора) |
| `ai/walk` | POST | M | 6/ч на user+trip | прогулка на 1–6 ч: OSM-POI в радиусе 300–5000 м минус места поездки, ИИ собирает таймлайн |
| `ai/status` | GET | U | — | работает ли ИИ у пользователя: `{ available, blocked, source }` (ключ и адрес не отдаются); по нему вкладка AI показывает «подключите свой ключ» |
| `user/ai-key-check` | POST | U | 5/мин | проверка своего ключа живым запросом (общий ключ не проверяется) |

Ключ LLM резолвится: юзер (свой ключ + свой Base URL/модель = полный BYOK; иначе
свой ключ на общем адресе) → `AppSettings` админа → `OPENAI_API_KEY`
(`src/lib/ai-key.ts`, чистая функция `pickAiConfig`). Инвариант: юзерский адрес
получает только юзерский ключ. Все вызовы — через единый оркестратор `runAi`
(`src/lib/ai.ts`): блок-проверка → лимит → вызов → запись в `AiUsage`; **не через
`outbound.ts`** (ретраи платных вызовов не нужны, нужен HTTP-статус и
`redirect:"error"`). Заблокированным админом (`User.aiBlocked`) ИИ недоступен при
любом источнике ключа (403).

## «Сочтёмся» — общие траты друзей (`src/app/api/split/**`, ADR-0009)

Отдельно от поездок: свои группы (`SplitGroup`), участники (`SplitMember`), траты, переводы. Суммы — целые центы
в валюте группы, даты — `ГГГГ-ММ-ДД` (тип DATE), ссылки — на `SplitMember.id`. Клиент добавляет `?today=ГГГГ-ММ-ДД`
(его локальная дата; сервер верит не дальше суток от своей UTC-даты). Контракт ответов — `src/lib/split/types.ts`.

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `split/groups` | GET, POST | U | POST 20 / ч / user | мои группы + мой баланс (5 агрегатов, не выкачивание трат) / создать (создатель — владелец; ≤30 групп на человека) |
| `split/groups/[groupId]` | GET, PATCH, DELETE | G (DELETE — владелец) | — | группа и ВСЕ участники (в т.ч. вышедшие) / название-значок-цвет любой участник, валюта (только пока нет трат), `allowMemberInvites` и `remindAfterDays` (автонапоминание 3/7/14 дней или `null`) — владелец / удалить со всем содержимым (в теле точное название; порядок удаления — `deleteSplitGroup`) |
| `split/groups/[groupId]/ledger` | GET | G | — | траты + переводы + шаблоны + недавние напоминания (14 дней) одним ответом; перед чтением лениво создаёт недостающие повторяющиеся траты (`recurring-run.ts`). Баланс считает клиент |
| `split/groups/[groupId]/expenses` | POST | G | 120 / мин / user | трата: сервер сам считает доли (`computeShares`), Σ долей = сумме; режимы equal / exact / shares / percent. `amountCents` — в валюте группы; ввод в другой валюте — `original: {amountCents, currency}` (сервер пересчёт НЕ проверяет: сумму вправе поправить человек) |
| `split/groups/[groupId]/expenses/[expenseId]` | PATCH, DELETE | G (любой участник) | 120 / мин / user | правка (дифф в журнал; без изменений — тишина) / удаление (периодическая трата запоминает пропущенный период) |
| `split/groups/[groupId]/payments` | POST | G (сторона пары) | 60 / мин / user | «отдал деньги»; идемпотентно по `clientKey`; больше долга — можно (встречный долг). Необязательный `expenseId` — перевод «за конкретную трату» (трата обязана быть из этой группы, иначе 400): помечает долю в ней оплаченной, на балансе пары это обычный перевод; удаление траты оставляет перевод (связь обнуляется) |
| `split/groups/[groupId]/payments/[paymentId]` | DELETE | G | 60 / мин / user | отменить перевод |
| `split/groups/[groupId]/recurring` | POST | G | 30 / мин / user | шаблон повторяющейся траты (аренда, подписка); с `original` — каждый период пересчитывается сервером по живому курсу (нет курсов — не создаётся) |
| `split/groups/[groupId]/recurring/[recurringId]` | PATCH, DELETE | G | 30 / мин / user | пауза/возобновление или правка шаблона / удаление (созданные траты остаются) |
| `split/groups/[groupId]/remind` | POST | G | 30 / ч / user; пара — раз в 12 ч | «Напомнить» должнику `{debtorId}` (ADR-0010): только о реальном текущем долге перед собой (считает сервер, ≥1,00), → колокольчик+пуш `split_reminder` должнику; без аккаунта — `delivered:false` (клиент отдаёт текст), кулдаун не тратится; 429 с «через N ч» |
| `split/groups/[groupId]/activity` | GET | G | — | журнал, новые сверху, постранично (`?before=<ISO>`) |
| `split/groups/[groupId]/members` | POST | G | 30 / ч / user | добавить участника без аккаунта |
| `split/groups/[groupId]/members/[memberId]` | PATCH, DELETE | G | — | профиль / передача владения (`{role:"owner"}`) · выйти или убрать (мягко, строка остаётся; безаккаунтного без истории — удаляет) |
| `split/join` | GET, POST | 🌐 превью / U | 30 / мин / IP (POST ещё и / user) | превью группы по коду + «свободные» безаккаунтные строки / вступить (`claimMemberId` — «Это я»; удалённый (`removed`) не возвращается) |

## Уведомления и пуш

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `notifications` | GET, POST | U | — | свои уведомления + счётчик непрочитанных / отметить прочитанным |
| `push/subscribe` | POST, DELETE | U | rateLimitMiddleware | подписка/отписка web-push; endpoint — только https и публичный хост (`net-guard`, с DNS-резолвом) |
| `push` | POST, PUT, GET | U | — | отправка/тест пуша, статус VAPID |
| `push/vapid-public-key` | GET | 🌐 | — | публичный VAPID-ключ |
| `feedback` | POST | U | userRateLimit (5/ч) | обращение: баг/идея/вопрос/жалоба/отзыв (multipart; скриншот через storage; контекст `screen`/`viewport`/`appVersion`, UA — с сервера, `noContext=1` — не прикладывать); админам уходит колокольчик+пуш `feedback_new` |
| `feedback/guest` | POST | 🌐 | 3/ч и 10/сутки / IP | обращение без входа (`{message,email,website}`; `website` — приманка для ботов): тип `question`, `userId=null`, `contactEmail` |
| `feedback/mine` | GET | U | — | свои обращения: статус, превью последней реплики, `unread` (ответ новее `userSeenAt`); `?summary=1` — только `{unread}` |
| `feedback/[id]` | GET | U | — | своё обращение с перепиской; открытие ставит `userSeenAt` (чужое = 404) |
| `feedback/[id]/messages` | POST | U | userRateLimit (20/ч) | автор дописывает `{body}`; статус → `new` (даже из закрытого), админам — уведомление |

## Админка (все — A, большинство с userRateLimit)

| Роут | Методы | Что делает |
|---|---|---|
| `admin/users` | GET, PATCH, DELETE | юзеры: premium, роль, блок ИИ (`aiBlocked`), пароль, удаление (AdminLog + уведомление) |
| `admin/trips` | GET, PATCH, DELETE | все поездки |
| `admin/trips/members` | GET, POST, DELETE | участники любой поездки |
| `admin/settings` | GET, PUT | `AppSettings`: ключ/база/модель ИИ, регистрация и бета-гейт `inviteRequired`, лимиты free, пороги алертов трат ИИ, витрина лендинга (`demoTripToken`, `contactTelegram`), реквизиты поддержки (`donationAlertsUrl`, `webmoneyPurse`) |
| `admin/invites` | GET | инвайт-коды беты: список, новые сверху (до 500) |
| `admin/invites` | POST | генерация пачки `{ count ≤ 100, maxUses ≤ 1000, expiresAt?, note? }` → `{ codes }` (AdminLog: invite.create) |
| `admin/invites/[id]` | PATCH | вкл/выкл кода `{ deactivatedAt: boolean }` → `{ code }` (AdminLog: invite.deactivate) |
| `admin/ai` | GET | телеметрия ИИ: сутки/неделя, ряды 14д по фичам, юзеры с порогами/блоком, последние вызовы |
| `admin/storage` | GET, POST | статистика и очистка хранилища |
| `admin/stats` | GET | сводка дашборда; `health.disk` — свободное место диска с фото и базой (`ok`/`low`/`critical`), при `low`/`critical` в «Обзоре» плашка внимания |
| `admin/journal` | GET | журнал действий админов (`AdminLog`) |
| `admin/feedback` | GET, PATCH, DELETE | очередь обращений (`status`/`type`/`q`, курсор `cursor`→`nextCursor`, по `lastActivityAt`); PATCH `{id,status?,adminNote?}` (закрытие уведомляет автора); DELETE с перепиской и скриншотом |
| `admin/feedback/[id]` | GET | обращение целиком: переписка, автор, контекст устройства, поездка |
| `admin/feedback/[id]/messages` | POST | ответ админа `{body,status?}`: автору — колокольчик/пуш `feedback_reply` со ссылкой `/?feedback=<id>`, гостю — письмо на `contactEmail` (ответ `emailed`: `false`, если почта не настроена) |

## Rate limits (сводка)

Задаются в самих роутах через `rateLimitMiddleware` (по IP; IP — первый из
X-Forwarded-For, ему доверяем только за Caddy) и `userRateLimit` (по user).
In-memory, сбрасываются рестартом контейнера (ADR-0005).

- login — 20 / 15 мин / IP (все попытки) и 8 неудач / 15 мин / email (успешный вход сбрасывает)
- register — 20 / ч / IP (мобильные операторы делят один IP на многих; от перебора кода защищает его длина)
- register-options — 60 / мин / IP (страница логина дёргает его на каждом заходе)
- forgot-password — 5 / ч / IP и 3 / ч / email
- reset-password — 20 / ч / IP
- join (GET-превью и POST) — 30 / мин / IP, POST ещё и 30 / мин / user
- «Сочтёмся»: напоминание о долге — 30 / ч / user и раз в 12 ч на пару; split/join — как join поездок; создание группы 20 / ч / user; траты 120 / мин, переводы 60 / мин, шаблоны 30 / мин, безаккаунтные участники 30 / ч (все — / user)
- health — 60 / мин / IP (БД-пинг кэшируется на 5 с)
- weather — 30 / мин / IP
- geocode — 60 / ч / user
- photos — 500 / ч / user (несколько батчей по 30–50 кадров за час — норма; 150/ч исчерпывались активным использованием, 429 отвечает внятным текстом «Лимит … исчерпан»)
- публичные `/p/[token]/*` — photos.zip 5 / ч / IP, photos 60 / ч / IP, heart 10 / ч / IP (анонимные гостевые эндпоинты)
- ИИ-роуты (ai-summary, phrases, foods) — 10 / ч / user+trip; ai/planner — 3 / ч, ai/restaurants и ai/walk — 6 / ч (реестр лимитов: `AI_FEATURES` в `src/lib/ai-usage.ts`). Там же per-feature таймаут вызова провайдера (дефолт 60 с; ai-summary — 180 с: «размышляющие» GLM-модели пишут рассказ 70–90 с, walk и ai/planner — 90 с: JSON на все дни большой поездки). Обрезка ответа провайдером (`finish_reason=length`) пишется в AiUsage как `error:"truncated"`

## Realtime-события

Канал read-only; клиент после события инвалидирует TanStack Query.
Публикация: `publish(tripId, event, payload, actorId?)` из `src/lib/ws-bus.ts`,
handshake требует JWT. Актуальный список: `trip:updated`,
`place:created/updated/deleted`, `photo:added/deleted`,
`expense:added/deleted`, `budget:updated`,
`board:added/pinned/updated/deleted`, `journal:added/updated/deleted`,
`checklist:updated`, `info:updated`, `food:updated`, `phrase:updated`,
`lodging:added/updated`, `member:joined` (вступление по инвайт-коду).

«Сочтёмся» живёт в своих комнатах `group:<groupId>`: клиент шлёт `split:join` / `split:leave` (массив id; членство проверяется
на сервере каждый раз, без кэша), сервер публикует `split:changed` (`publishRoom` из `ws-bus.ts`, `kind`: `expense.created|updated|deleted`,
`payment.created|deleted`, `member.changed`, `group.updated`, `recurring.changed`; в payload — автор и данные для тоста). Пуши
персональные и только затронутым (`src/lib/split/notify.ts`): новая трата — плательщику и тем, на кого делится; перевод — второй
стороне, ещё и записью в колокольчик (`split_payment`); напоминание о долге — должнику записью и пушем (`split_reminder`, ручное и автоматическое: часовой таймер `startSplitReminderJob` в `server.ts`, ADR-0010). Исключение/выход обязаны звать `evictFromGroupRoom`.

Поверх них `ws-bus.ts` издаёт в комнату мета-событие `notification` (тост) для
событий из `NOTIFICATION_MAP` (`place:created`, `photo:added`, `expense:added`,
`journal:added`, `board:added`, `lodging:added`); те же события дополнительно уходят в web-push
участникам, кроме автора мутации (`actorId`). Остальные события — тихая
инвалидация, без тостов и пушей.
