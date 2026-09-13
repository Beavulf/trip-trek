# Карта API TripTrek

Все роуты — `src/app/api/**/route.ts` (App Router). Документ-карта: что где лежит,
кто может вызвать, какие лимиты. Скелет роута и правила — [architecture.md](architecture.md#3-backend-api-роуты).

## Уровни доступа

| Метка | Гард (`src/lib/api-auth.ts`) | Смысл |
|---|---|---|
| 🌐 | — | публичный (анонимный доступ разрешён) |
| U | `requireUser` | любой залогиненный |
| M | `requireTripMember` | участник поездки (TripMember: owner или member) |
| O | `requireTripOwner` | владелец поездки |
| A | `requireAdmin` | `User.role === "admin"` (роль всегда из БД) |

Ответы гардов: 401 `Unauthorized`, 403 `Forbidden` / `Not a member of this trip` /
`Only trip owner can do this`.

Идентификация пользователя — JWT в cookie `next-auth.session-token` (30 дней;
смена пароля инвалидирует старые токены через `passwordChangedAt`).

## Auth и аккаунт

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `auth/custom-login` | POST | 🌐 | 5/15 мин/IP | логин (bcrypt), ставит JWT-cookie; проверяет Origin (NEXTAUTH_URL) и Content-Type: application/json (login-CSRF) |
| `auth/custom-session` | GET | 🌐 | — | текущая сессия (учитывает `passwordChangedAt`); в `user` входит `onboardingCompletedAt` (null = показать обучение) |
| `auth/custom-signout` | POST | 🌐 | — | выход (снимает cookie) |
| `auth/register` | POST | 🌐 | 3/ч/IP | регистрация + welcome-письмо; проверяет `registrationEnabled`; email канонизируется (trim+lowercase); вступление в поездку — только через `trips/join` по коду |
| `auth/forgot-password` | POST | 🌐 | 5/ч/IP (+3/ч/email) | одноразовый токен (sha256 в БД, TTL 60 мин) + письмо; анти-перечисление |
| `auth/reset-password` | POST | 🌐 | 20/ч/IP | сброс по токену, инвалидирует сессии |
| `auth/[...nextauth]` | * | 🌐 | 5/15 мин/IP (POST) | NextAuth-совместимость; клиент ходит в custom-*; credentials-вход под тем же лимитом, что и custom-login |
| `user` | GET, PATCH | U | — | свой профиль (имя, emoji, цвет, аватар, ИИ-ключ); PATCH принимает также `onboardingCompleted`: true — обучение пройдено/пропущено, false — сброс («Пройти заново» в профиле) |
| `user/password` | POST | U | userRateLimit | смена пароля → инвалидация всех сессий |
| `user/avatar` | POST | U | userRateLimit | аватар (через `src/lib/storage`) |
| `user/upgrade` | POST | U | — | переход на premium (ручной сценарий; известная заглушка) |
| `user/ai-key-check` | POST | U | userRateLimit | проверка ТОЛЬКО своего BYOK-ключа у LLM (общий не трогается), наружу — только маска |
| `limits` | GET, POST, PATCH | U / M | — | лимиты плана юзера (maxTrips/maxMembers: free из `AppSettings`, premium = ∞) |

## Поездки и участники

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `trips` | GET, POST | U | — | список своих поездок / создание (проверяет freeTripLimit) |
| `trips/[tripId]` | GET, PATCH, DELETE | M / O | — | карточка поездки; правка — M (частично O), удаление — O |
| `trips/[tripId]/members/[memberId]` | PATCH | M(owner) | — | роль/имя участника, передача владения (ownership → уведомление) |
| `trips/join` | GET, POST | U | 30/мин/IP + userRateLimit | превью поездки по инвайт-коду / вступление (проверяет TripBan, freeMemberLimit) |
| `trips/from-template` | POST | U | — | создать поездку из шаблона (`src/lib/trip-templates.ts`) |
| `trip` | GET, PATCH | M / O | — | сводка поездки: участники, счётчики, дни-мета БЕЗ мест (слим-формат, аудит 2026-09-13); `email` участников — только владельцу; дни с местами — `route`; PATCH — только владелец: `{status}` и/или `{title}` (переименование из «О поездке») |
| `trip/dates` | PATCH | O | — | сдвиг дат/дней поездки |
| `trip/budget` | PATCH | M | — | общий бюджет/валюта поездки |
| `trip/import` | POST | U | userRateLimit | импорт JSON-бэкапа → новая поездка |
| `import` | POST | O | — | импорт в существующую поездку (owner) |
| `export` | GET | M | — | экспорт поездки в JSON (`src/lib/trip-export.ts`) |
| `participants` | GET, PATCH | M / U | — | участники поездки; PATCH — профиль «себя в поездке» (displayName/emoji) |
| `participants/[id]` | PATCH, DELETE | M(owner) | userRateLimit | правка/удаление участника (удаление → уведомление) |
| `participants/leave` | POST | U | userRateLimit | выйти из поездки |
| `participants/ban` | POST, GET, DELETE | M(owner) / U | userRateLimit | бан/разбан юзера в поездке (TripBan) |
| `search` | GET | M | — | поиск по объектам поездки; сравнение строк в JS (кириллица/иероглифы) |

## Контент поездки (все — M)

| Роут | Методы | WS-событие | Что делает |
|---|---|---|---|
| `route` | GET | — | модель чтения маршрута: дни+места+мета поездки одним запросом (`useRoute`); единственный источник дней с местами — дашборд, лента и галерея тоже читают его через `useRouteDays` |
| `days` | POST, PATCH, DELETE | `trip:updated` | мутации дней (город, даты); GET удалён (аудит 2026-09-13) — читайте `route` |
| `places` | POST | `place:created` | новое место (день, координаты, категория) |
| `places/[id]` | PATCH, DELETE | `place:updated/deleted` | правка/удаление места, статус visited |
| `photos` | GET, POST, DELETE | `photo:added` | галерея; POST — загрузка файла (storage, EXIF-гео); GET отдаёт `place` проекцией {name, lat, lng} |
| `photos/[id]` | PATCH | `photo:added` | подпись/избранное |
| `photos/geo` | GET | — | фото с координатами для карты: селект маркерных полей, кап 1000 |
| `expenses` | GET, POST, DELETE | `expense:added` | траты, делёж (`src/lib/budget/`), погашения (settlementKey) |
| `budget-plan` | GET, PATCH | `budget:updated` | плановый бюджет по категориям |
| `board` | GET, POST, PATCH, DELETE | `board:added` | чат поездки (реакции JSON, ответы, pin) |
| `journal` | GET, POST, PATCH, DELETE | `journal:added` | дневник (запись на день, mood) |
| `checklist` | GET, POST, PATCH, DELETE | `checklist:updated` | чек-лист подготовки |
| `info` | GET, POST, PATCH, DELETE | `info:updated` | справка (визы, сим-карты…) |
| `phrases` | GET, POST, PATCH, DELETE | `phrase:updated` | разговорник (ru/cn/pinyin, language) |
| `foods` | GET, POST, PATCH, DELETE | `food:updated` | гастрогид (голоса wantedBy) |
| `nearby` | GET | — | что рядом (внешние API через outbound) |

## Внешние данные и утилиты

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `geocode` | GET | U | — | Nominatim через `outbound.ts` |
| `city-search` | GET | 🌐 | rateLimitMiddleware | автодополнение городов (`src/lib/city-coords.ts` + Nominatim) |
| `weather` | GET | 🌐 | — | Open-Meteo (публично: панель погоды без сессии не ломает UX) |
| `currency` | GET | 🌐 | rateLimitMiddleware | курсы open.er-api.com (`src/lib/currencies.ts`) |
| `health` | GET | 🌐 | — | `{"status":"ok","db":"up"}` — для мониторинга/uptime |

## ИИ

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `ai-summary` | POST | M | 10/ч на user+trip | итоги поездки (LLM); без ключа — локальный черновик (`generated:false`), заблокирован юзер — 403 |
| `phrases/generate` | POST | M | 10/ч на user+trip | базовый разговорник по направлению |
| `phrases/ai` | POST | M | 10/ч на user+trip | фразы по свободному запросу (3 режима: translate/more/pack) |
| `foods/suggest` | POST | M | 10/ч на user+trip | предложения блюд по городу |
| `user/ai-key-check` | POST | U | 5/мин | проверка своего ключа живым запросом (общий ключ не проверяется) |

Ключ LLM резолвится: юзер (свой ключ + свой Base URL/модель = полный BYOK; иначе
свой ключ на общем адресе) → `AppSettings` админа → `OPENAI_API_KEY`
(`src/lib/ai-key.ts`, чистая функция `pickAiConfig`). Инвариант: юзерский адрес
получает только юзерский ключ. Все вызовы — через единый оркестратор `runAi`
(`src/lib/ai.ts`): блок-проверка → лимит → вызов → запись в `AiUsage`; **не через
`outbound.ts`** (ретраи платных вызовов не нужны, нужен HTTP-статус и
`redirect:"error"`). Заблокированным админом (`User.aiBlocked`) ИИ недоступен при
любом источнике ключа (403).

## Уведомления и пуш

| Роут | Методы | Доступ | Лимит | Что делает |
|---|---|---|---|---|
| `notifications` | GET, POST | U | — | свои уведомления + счётчик непрочитанных / отметить прочитанным |
| `push/subscribe` | POST, DELETE | U | rateLimitMiddleware | подписка/отписка web-push |
| `push` | POST, PUT, GET | U | — | отправка/тест пуша, статус VAPID |
| `push/vapid-public-key` | GET | 🌐 | — | публичный VAPID-ключ |
| `feedback` | POST | U | userRateLimit | баг-репорт/идея (скриншот через storage, UA заполняет сервер) |
| `feedback/mine` | GET | U | — | свои обращения и ответы админа |

## Админка (все — A, большинство с userRateLimit)

| Роут | Методы | Что делает |
|---|---|---|
| `admin/users` | GET, PATCH, DELETE | юзеры: premium, роль, блок ИИ (`aiBlocked`), пароль, удаление (AdminLog + уведомление) |
| `admin/trips` | GET, PATCH, DELETE | все поездки |
| `admin/trips/members` | GET, POST, DELETE | участники любой поездки |
| `admin/settings` | GET, PUT | `AppSettings`: ключ/база/модель ИИ, регистрация, лимиты free, пороги алертов трат ИИ |
| `admin/ai` | GET | телеметрия ИИ: сутки/неделя, ряды 14д по фичам, юзеры с порогами/блоком, последние вызовы |
| `admin/storage` | GET, POST | статистика и очистка хранилища |
| `admin/stats` | GET | сводка дашборда |
| `admin/journal` | GET | журнал действий админов (`AdminLog`) |
| `admin/feedback` | GET, PATCH, DELETE | обработка фидбека, ответ юзеру (→ уведомление) |

## Rate limits (сводка)

Задаются в самих роутах через `rateLimitMiddleware` (по IP; IP — первый из
X-Forwarded-For, ему доверяем только за Caddy) и `userRateLimit` (по user).
In-memory, сбрасываются рестартом контейнера (ADR-0005).

- login — 5 / 15 мин / IP (включая `auth/[...nextauth]` POST)
- register — 3 / ч / IP
- forgot-password — 5 / ч / IP и 3 / ч / email
- reset-password — 20 / ч / IP
- join (GET превью) — 30 / мин / IP
- health — 60 / мин / IP (БД-пинг кэшируется на 5 с)
- weather — 30 / мин / IP
- geocode — 60 / ч / user
- ИИ-роуты — 10 / ч / user+trip

## Realtime-события

Канал read-only; клиент после события инвалидирует TanStack Query.
Публикация: `publish(tripId, event, payload)` из `src/lib/ws-bus.ts`,
handshake требует JWT. Актуальный список: `trip:updated`,
`place:created`, `place:updated`, `place:deleted`, `photo:added`,
`expense:added`, `budget:updated`, `board:added`, `journal:added`,
`checklist:updated`, `info:updated`, `food:updated`, `phrase:updated`.
