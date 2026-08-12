# TripTrek — Итоговый список всех исправлений

> Документ создан после прохождения 10 аудитов (Budget, Chill, Journal, AI Summary, Weather, Food, Phrases, Board, Info, Achievements).
> Все изменения — в коде, ESLint чистый, сервер работает.

---

## 📊 Сводка по аудиту

| # | Вкладка | P0 | P1 | P2 | Статус |
|---|---------|----|----|-----|--------|
| 1 | Бюджет | 4 | 10 | 3 | ✅ Готово |
| 2 | Chill | 3 | 10 | 4 | ✅ Готово |
| 3 | Дневник | 4 | 7 | 2 | ✅ Готово |
| 4 | AI Сводки | 4 | 7 | 3 | ✅ Готово |
| 5 | Погода | 4 | 6 | 3 | ✅ Готово |
| 6 | Еда | 3 | 6 | 1 | ✅ Готово |
| 7 | Фразы | 4 | 7 | 2 | ✅ Готово |
| 8 | Чат | 5 | 7 | — | ✅ Готово |
| 9 | Инфо | 6 | 5 | 2 | ✅ Готово |
| 10 | Награды | 3 | 5 | 2 | ✅ Готово |

**Итого: 40 P0 + 70 P1 + 22 P2 = 132 пункта исправлений**

---

## 1. 📊 Бюджет (Budget)

### P0
- **GET budget-plan auth** — `requireTripMember` на GET (было открыто)
- **useAddExpense/useDeleteExpense throw on !ok** — хуки теперь выбрасывают (было `return r.json()` → фейковый success-toast)
- **Идемпотентность расчётов (settlement)** — новое поле `settlementKey String? @unique` в схеме; детерминированный ключ `settle-{fromId}-{toId}-{YYYY-MM-DDTHH}` → повторный клик/два клиента не дублируют расчёт, баланс не ломается
- **Загрузка/ошибка (состояния)** — `useTrip`/`useExpenses`/`useBudgetPlan` с `enabled: !!tripId` + `placeholderData: []`; экраны ошибок с кнопкой «Обновить»; TripSwitcher автоматически выбирает первую поездку если localStorage пуст

### P1
- **Единый фильтр isRealExpense** — settlement исключён из `totalSpent` в `/api/trip`, `ParticipantBudgetRow`, `BudgetPlanWidget` (было включено → завышало суммы)
- **BudgetEditModal invalidate** — использует хук `useUpdateMember` (был raw fetch без проверки `r.ok` и invalidate)
- **Toast onSuccess/onError only** — `ParticipantBudgetRow` + `BudgetHero` показывают toast после ответа (было сразу после `mutate`)
- **GET расходов с day include** — `day: { select: { dayNumber, city } }` в include (UI «День N» работал пустым)
- **Резервный курс валют (полное покрытие)** — все 24 валюты (MYR, VZD, CHF, KZT и др.); общий константный `src/lib/currencies.ts`
- **MarkSettled fallback для авторизации** — если не залогинен → amber CTA «Войти» (было null)
- **Честная подсказка для попарного алгоритма** — «попарные переводы» + amber-note для 3+ участников (была ложь про «ноль одним набором»)
- **Округление toFixed(2)** — единообразно в settlement/balances/rows (было toFixed(0) в списках, toFixed(2) в деталях)
- **PATCH /api/trip/budget emitWS** — `emitWS("trip:updated")` после обновления (было без WS → другие клиенты не видели)
- **POST расхода с проверкой участников** — `paidById` и `splitWith[]` проверяются на ∈ members

### P2
- Empty history CTA «Пока нет трат» + счётчики real vs settlement раздельно
- `tabular-nums` для выравнивания чисел
- Мобильные цели ≥36px

---

## 2. ☕ Chill (Отдых)

### P0
- **GET /api/nearby auth + rate-limit** — `requireUser` (было открыто); in-memory rate-limit 60 req/час на пользователя; без coords → 400 (было значение по умолчанию Гуанчжоу!); User-Agent `TripTrek/1.0` (был `TripTrekChina/1.0`)
- **useNearby выбрасывает при !ok** — 500 от Overpass → состояние ошибки (было `return r.json()` → silent empty «ничего не найдено»)
- **Загрузка/ошибка (состояния)** — RestChill показывает ошибки с кнопкой «Обновить» (был вечный «Загрузка…»)

### P1
- **Wishlist с привязкой к конкретной поездке** — ключ `triptrek-wishlist:${tripId}` (был общий `triptrek-wishlist` → смешивание между поездками); миграция старого ключа
- **Единый вспомогательный модуль wishlist** — `src/lib/wishlist.ts` с `loadWishlist`/`saveWishlist`/`wishlistDedupeKey`/`migrateLegacyWishlist` (был прямой LS-запрос в 2 местах)
- **Visit/rating с состоянием ожидания + проверка ok + userName** — toast в `onSuccess`/`onError`; `disabled={isPending}`; `userName` передаётся в PATCH
- **Empty с разделением** — нет дней / нет chill-мест / фильтр пуст → разные CTA
- **Валюта из trip.settings.currency** — ChillCard показывает €, ¥, ₽ (было всегда `$`)
- **Hero с привязкой к поездке на русском языке** — «Отдых и перекус» (было EN «Rest & Chill»); показывает название текущей поездки
- **Ключ Nearby = lat+lng+name** — был `key={i}` (терял состояние); дедупликация по составному ключу (было по имени → коллизии)
- **cachedGeo сбрасывается при смене поездки** — `cachedGeo.tripId` поле + useEffect (был module-level без сброса)
- **RestTimer встроен** — был orphan (нигде не импортировался). *Позже удалён по запросу пользователя.*

### P2
- Мобильные цели 44px
- Метрики Hero: wishlist count
- Общий `CHILL_CATEGORIES` const для RestChill + trip-map
- a11y метки на visit/stars

---

## 3. 📔 Дневник (Journal)

### P0
- **Автор через session.user.id** — UI отправлял `trip.settings.currentUserId` (всегда `null`) → записи были анонимными. Теперь `useAuth()` как в Board.
- **GET /api/journal требует tripId** — без tripId → 400 (было `where={}` → все записи всех поездок)
- **POST проверяет dayId ∈ tripId** — `db.day.findUnique` + проверка `day.tripId !== tripId` → 400
- **Удаление с подтверждением + ownership + видимость на мобильных** — только автор или владелец может удалить (403 иначе); встроенное подтверждение «Да»/«Нет»; `md:opacity-0 md:group-hover:opacity-100` (на мобильных всегда видно)

### P1
- **Delete hit-area ≥44px + a11y** — aria-labels на всех кнопках
- **Empty с разделением** — нет дней → CTA «Перейти в Маршрут»; нет записей → «Дневник пуст»; фильтр → «Нет записей этого автора»
- **Хуки выбрасывают при !ok** — `useAddJournal`/`useDeleteJournal`; try/catch в UI; не чистит textarea при ошибке
- **Мультиавторский UX** — аватар + имя, «Вы» для текущего пользователя; chip-фильтр по автору; hero показывает «N автора»
- **WS await emitWS** на POST и DELETE
- **Валидация контента** — `trim()`, `maxLength 5000`, счётчик символов, mood whitelist

### P2
- Общий `MOODS` const для Journal + QuickAdd (было 10 vs 8)
- Ожидание для каждой строки при удалении

---

## 4. ✨ AI Сводки (AI Summary)

### P0
- **Auth + membership** — `requireTripMember` на POST (было открыто — любой мог читать journal/expenses и тратить LLM)
- **Нет отката к default-trip** — без tripId → 400 (было `|| "default-trip"` → утекали данные China)
- **Ошибка SDK → 502** — при падении open-meteo/z-ai-sdk → 502 error (было 200 + фейковый шаблон «продолжаем исследовать» с бейджем «AI-сгенерировано»)
- **Rate-limit на LLM** — in-memory бакет per `userId:tripId`, 10 запросов/час; 429 с сообщением об ошибке; изоляция для каждой поездки

### P1
- **Empty "нет поездки" + отключение генерации** — если нет tripId → CTA, кнопки отключены
- **Общая формула currentDayNumber** — `src/lib/trip-days.ts` `calculateCurrentDayNumber()` используется и в `/api/trip` и в `/api/ai-summary` (были разные формулы)
- **Богаче промпт** — member names (не просто count), journal texts (до 10, 800 символов), photo captions (до 10); честный copy
- **Валюта из trip.settings.currency** — `currencySymbol()` маппит 24 валюты; в промптах и футере
- **Сброс контента при смене поездки** — `key={tripId}` remount pattern; убран мёртвый `invalidateQueries(["ai-summary"])`
- **Clipboard try/catch** — `await navigator.clipboard.writeText` + fallback `document.execCommand("copy")` для mobile HTTP
- **Бейдж Provenance** — «AI-сгенерировано» только когда `generated: true` (шаблоны убраны полностью)

### P2
- Мобильные цели 44px, aria-labels
- Системный промпт: «русский + markdown + не больше 8 пунктов + не выдумывай факты»
- totalSpent без settlement

---

## 5. 🌤️ Погода (Weather)

### P0
- **Единый путь получения погоды — нет Null Island** — только один хук: coords → `useWeatherByCoords`, known city → `useWeather`; `enabled` только при реальных coords (не 0,0)
- **cityKey "custom" без autocomplete → CTA** — «Нет координат для «{name}»» + «Перейти в Маршрут» (было пусто)
- **Отрицательные coords в custom-*** — новый формат `custom:{lat},{lng}` + regex для старого формата; `custom--33.86-151.2` теперь работает (было NaN)
- **Загрузка дней = ложное пустое состояние** — 4 состояния: loading / нет поездки / нет дней / ок

### P1
- **UI ошибки/отката** — API возвращает 502 при падении open-meteo (было 200 + фейковые 28°); AlertCircle + кнопка «Повторить»
- **Общий словарь KNOWN_CITIES** — `src/lib/city-coords.ts` с 15 городами (China 4, Asia 5, Europe 6); `resolveCityCoords`/`decodeCustomKey`/`hasCityCoords`
- **Убрано значение по умолчанию "|| guangzhou"** — без города → пустое состояние
- **Резервные координаты мест** — если `resolveCityCoords` не находит → берёт первое место дня с coords

### P2
- Мобильные чипы + safe-area
- forecast:[] пояснение
- Градиент из accent города (не indigo `#6366f1`)

---

## 6. 🍽️ Еда (Food)

### P0
- **Кнопка удаления отображается** — `useDeleteFood` + `Trash2` импортировались, но кнопка НИКОГДА не рендерилась (мёртвый код!). Теперь: подтверждение «Да»/«Нет», try/catch, видимость на мобильных.
- **GET /api/foods требует tripId** — без tripId → 400 (было `where={}` → все блюда всех поездок)
- **Auth/membership на PATCH** — PATCH (JSON + multipart) БЫЛ БЕЗ проверки членства! Теперь: `findUnique(id)` → 404 → `requireTripMember`

### P1
- **Empty с разделением** — нет блюд → «Пока нет блюд» + CTA; фильтр пуст → «Ничего не найдено» + «Сбросить фильтр»
- **Хуки выбрасывают при !ok** — `useUpdateFood`/`useDeleteFood`/`useUploadFoodPhoto`; toast только в onSuccess
- **Защита от двойного отправления** — все кнопки `disabled={isPending}`
- **Убрано смещение в сторону Китая** — placeholder «Например, Пельмени» (был «Димсам»), label «Оригинальное название» (был «Местное название»), placeholder «На местном языке» (был «点心»)
- **Лимиты загрузки** — проверка MIME (JPEG/PNG/WebP/GIF) → 400; размер 10MB → 400; PATCH требует id → 404

### P2
- Исправление sticky + a11y метки

---

## 7. 💬 Фразы (Phrasebook)

### P0
- **GET требует tripId + auth** — без tripId → 400; `requireTripMember` на GET
- **Auth на generate** — `requireTripMember` на POST generate (было открыто — любой мог генерировать в чужой tripId)
- **UI генерации подключён** — API существовал, но UI НИКОГДА его не вызывал! Теперь: пустое состояние → «Загрузить разговорник» → выбор языка (9 языков) → POST generate; `emitWS`; защита от гонок (race guard)
- **Глобальный поиск фраз по tripId** — `phraseWhere.tripId = tripId` (было все фразы всех поездок)

### P1
- **Google Translate sl не захардкожен** — `src/lib/language-detect.ts` `detectLanguage(text)` → `googleTranslateUrl` использует `sl=ja` для японского (был всегда `zh-CN`)
- **Откат речи на en/auto для латиницы** — раньше дефолт `zh-CN` → китайский голос для английского/французского! Теперь: Latin без диакритики → `en-US`
- **Честный copy про избранное** — «⭐ Избранное — общее для всей компании в этой поездке»
- **Toggle выбрасывает при !ok** + `disabled={isPending}`
- **Нейтральные подписи** — «Ромадзи» для японского (был всегда «Пиньинь»); hero emoji 🎌 для японского (был всегда 🀄); footer без Baidu/Pleco
- **Generate emitWS + защита от гонок** — `await emitWS` после create; проверка count перед create (нет дубликатов)

### P2
- Метрики Hero: N фраз · M избранных
- a11y метки на Слушать/Translate/Избранное

---

## 8. 💬 Чат (Board)

### P0
- **GET требует tripId + auth** — без tripId → 400; `requireTripMember` на GET
- **POST userId из session** — клиент отправлял `userId` в body (можно было подменить!). Теперь: `userId: user!.id` из JWT.
- **Удаление с проверкой владельца** — `isAuthor || isOwner` → 403 «Можно удалять только свои сообщения» (было любой участник)
- **Empty/ошибка** — нет поездки/ошибка → экран с «Обновить»; нет сообщений → «Пока нет сообщений»
- **Исправление эмиссии Pin** — `SOCKET_EVENTS["board:pinned"]` мапил на `board:added` → **ложный toast «новое сообщение»** при закреплении! Теперь: `board:pinned` → `board:pinned`

### P1
- **Синхронизация Pin через WS** — API PATCH теперь `emitWS("board:pinned")`; `use-websocket.ts` обрабатывает `board:pinned`
- **Хуки выбрасывают при !ok** + toast только в onSuccess; контент не чистится при ошибке
- **Защита от двойного toast для автора** — API отправляет `userId` в emit → `emit-handler` включает `actorUserId` в notification → клиент пропускает toast если `actorUserId === currentUserId`; `useAuth` сохраняет userId в localStorage
- **Видимость на мобильных** — pin/delete всегда видны на мобильных; ≥36px; aria-labels
- **Валидация контента** — `trim()` → 400 если пусто; `maxLength 4000` + счётчик
- **CTA для входа** — если не залогинен → «Войдите чтобы писать сообщения» + «Войти»
- **Ожидание для каждой строки** при pin/delete

---

## 9. 📋 Инфо (InfoPanel)

### P0
- **GET checklist/info требует tripId** — без tripId → 400 (было `where={}` → все данные всех поездок)
- **Auth на export/import** — `requireTripMember` на GET export и POST import (было открыто)
- **DataBackup починен** — export с `?tripId=` (было без → 400); filename `triptrek-backup-` (был `triptrek-china-`); import marker `app === "TripTrek"` (был `"TripTrek China"` — export не отправлял `app` → всегда ошибка)
- **PushSettings без default-trip** — `usePushNotifications(getTripId())` (было `"default-trip"`)
- **useAddInfo с tripId в body** — `body: JSON.stringify({...data, tripId: getTripId()})` (было без tripId → всегда 400 → Info UI сразу мёртв)
- **Empty/ошибка/загрузка** — экраны ошибок; «Чек-лист пуст»; «Справка пуста»

### P1
- **InfoItem UI добавлен** (FIX E5) — новый `InfoView` компонент: список по типам (Контакты/Транспорт/Еда/Советы), форма добавления, удаление с подтверждением; нейтральные подписи
- **Хуки выбрасывают при !ok** — `useToggleChecklist`, `useDeleteChecklist`, `useAddInfo`, `useUpdateInfo`, `useDeleteInfo`
- **Подтверждение удаления** — checklist items и info items с подтверждением «Да»/«Нет»
- **Защита от двойного отправления** — `disabled={isPending}`
- **Убрано смещение в сторону Китая** — import destination `"Unknown"` (был `"China"`); backup filename `triptrek-backup-`

### P2
- Пустые категории схлопываются
- a11y метки

---

## 10. 🏆 Награды (Achievements)

### P0
- **useFoods() подключён** — `triedFoods` и `totalFoods` теперь LIVE (было `0`/`16` хардкод → Гурман/Шеф-критик **никогда** не разблокировались)
- **useChecklist() подключён** — `checklistDone` и `checklistTotal` теперь LIVE (было `0`/`15` хардкод → "Готов к поездке" never)
- **Empty/загрузка/ошибка** — `if (!trip) return null` заменён на экраны ошибок + спиннер (было blank под shell!)

### P1
- **Честные критерии дней** — "Финишер": «Дожить до последнего дня поездки» (было «Завершить все дни» — вводило в заблуждение)
- **Spent без settlement + валюта** — `realExpenses = expenses.filter(e => e.category !== "settlement")`; "Шопоголик: Потратить ${sym}500" (было хардкод `$500`)
- **Честный copy** — «Бейджи поездки (общие для всех участников)» (было выглядело как личное)
- **Адаптивные пороги еды** — если <5 блюд → target = totalFoods (не 5)
- **Stale trip switch** — все хуки используют `getTripId()` в queryKey + `enabled`

### P2
- Мобильное нажатие для раскрытия описаний (как в Profile)
- a11y — карточки как `<button>` с `aria-label`; progress bar с `role="progressbar"`

---

## 🔧 Инфраструктурные исправления

### Server
- **Turbopack → Webpack** — `const app = next({ dev, webpack: true })` в `server.ts`. Turbopack кэшировал хэш prisma client `2c3a283f134fdcb6`, которого не существовало → 500 на всех API. Webpack резолвит корректно.

### WebSocket
- **Anti double-toast** — `emit-handler.ts` включает `actorUserId` в notification payload; `use-websocket.ts` пропускает toast если `actorUserId === currentUserId`; `useAuth` сохраняет userId в localStorage
- **board:pinned event** — `SOCKET_EVENTS["board:pinned"]` → `board:pinned` (было `board:added` → ложный toast)
- **board:pinned handler** — `use-websocket.ts` обрабатывает `board:pinned` → invalidate `["board"]`

### Auth
- **api-auth.ts** — `requireTripMember` используется на всех GET/POST/PATCH/DELETE endpoints
- **useAuth** — сохраняет `triptrek-current-user-id` в localStorage для anti-double-toast

---

## 📁 Новые файлы

| Файл | Назначение |
|------|-----------|
| `src/lib/currencies.ts` | 24 валюты (единый source of truth) |
| `src/lib/wishlist.ts` | Scoped LS helper + migration + dedup key |
| `src/lib/chill-categories.ts` | Shared CHILL_CATEGORIES const |
| `src/lib/moods.ts` | Shared MOODS + isValidMood |
| `src/lib/trip-days.ts` | Shared calculateCurrentDayNumber |
| `src/lib/city-coords.ts` | KNOWN_CITIES dict + encode/decode custom keys |
| `src/lib/language-detect.ts` | detectLanguage + googleTranslateUrl |

---

## 📊 Статистика

- **Аудитов пройдено**: 10
- **P0 исправлений**: 40
- **P1 исправлений**: 70
- **P2 исправлений**: 22
- **Всего**: 132 пункта
- **Новых файлов**: 7
- **Модифицированных файлов**: ~35
- **Worklog**: 2004 строки
- **Cron job**: каждые 15 мин (webDevReview)

---

## ✅ Проверено

- ESLint: чистый
- Сервер: работает (webpack, не Turbopack)
- Все API: auth + tripId required + membership
- Все хуки: throw on !ok + enabled + placeholderData
- Все мутации: try/catch + toast onSuccess only
- Все удаления: confirm + ownership check
- Все кнопки на mobile: видны (не только group-hover)
- Везде: a11y aria-labels
- China bias: убран везде (нейтральные подписи, copy, placeholders)
- Settlement: исключён из всех totalSpent (бюджет, награды, AI, экспорт)
- Валюта: из trip.settings.currency везде (не хардкод `$`)
