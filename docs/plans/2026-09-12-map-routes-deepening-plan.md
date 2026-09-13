# План: углубление карты и маршрутов

> Источник: архитектурный аудит от 2026-09-12 (отчёт: `%TEMP%\architecture-review-20260912-1939.html`).
> Скоуп: `src/components/trip/trip-map.tsx`, `itinerary/`, `timeline.tsx`, хуки `use-days/use-places/use-trip`,
> серверные проекции `/api/days` и `/api/trip`.
> Словарь: **модуль**, **интерфейс**, **depth/deep/shallow**, **seam**, **adapter**, **leverage**, **locality**.

## Принципы

1. **Порядок фаз = порядок зависимостей.** Сначала чистые фундаменты (время, типы), потом модель чтения, потом канвас, потом формы и UI-оболочки. Каждый этап готовит seam для следующего.
2. **Одна фаза = одна ветка = один деплой.** На VPS 2 vCPU и сборки по одной за раз — не мержить две фазы без проверки предыдущей на https://triptrek.guild-ledger.net.by.
3. **Каждая фаза заканчивается тестами + ручной проверкой** на localhost:3000 до мержа.
4. Строки-ссылки (`файл:строка`) даны по состоянию на аудит (HEAD `52045cc`) — при работе ориентироваться на символы, не на номера.

---

## Фаза 0 — тестовая инфраструктура и глоссарий (~0.5 дня, риск: нулевой)

Проблема-фон: в репозитории нет ни одного теста и раннера; все последующие фазы заявляют «тесты улучшаются» — нужен инструмент.

1. Установить **vitest** (node-env, jsdom не нужен до фазы 4), скрипты `test` / `test:watch`.
2. Первые тесты на **уже существующие** чистые функции, у которых в комментариях записаны прошлые баги:
   - `src/lib/trip-days.ts` — `calculateCurrentDayNumber`, `dayDateFor`, `dayEndFor` (комментарии «P0 #3», «P1 #6»);
   - `src/lib/city-coords.ts` — `encodeCustomKey` / `decodeCustomKey` / `resolveCityCoords` (кейсы из «P0»-комментариев 37-44).
3. Создать **`CONTEXT.md`** в корне — глоссарий домена: `Place`, `Day`, `Route` (модель чтения), `TimeOfDay`, `MapCanvas`, `Focus bus`, `MapFilters`. Одной строкой на термин. Это навигационная цель аудита: имена будущих модулей фиксируются до их появления.

**Готово, когда:** `npm test` зелёный; CONTEXT.md существует.

---

## Фаза 1 — `TimeOfDay`: один источник порядка дня (S, ~0.5–1 день, риск: низкий)

Кандидат №4 из отчёта. Сейчас слоты времени ведутся руками в **7 файлах** и двумя разными `timeLabel`.

1. Создать `src/lib/time-of-day.ts`: `TIME_SLOTS` (порядок + подпись), `timeOrder(slot)`, `timeLabel(slot)`, `daySections(places)`. Чистые функции.
2. Заменить дубли:
   - `trip-map.tsx:61` `TIME_RANK` (сортировка `RouteThreads` на 1036);
   - `itinerary/DayCard.tsx:24-28` `TIME_SECTIONS` + группировка 61-71;
   - `itinerary/PlaceDialog.tsx:78-82` `TIMES`;
   - `add-place-sheet.tsx:229-233` инлайн-`<option>`;
   - `itinerary/PlaceRow.tsx:144-151` `timeLabel`;
   - `dashboard/DashboardHero.tsx:223` **вторая** реализация `timeLabel`;
   - `rest-chill/ChillCard.tsx:177-183` `TimeChip`.
3. Тесты: порядок слотов, подпись-фолбэк для неизвестного слота, группировка секций.

**Готово, когда:** новый слот времени добавляется правкой одного файла; линия на карте и порядок карточек дня совпадают; `npm test` зелёный.

---

## Фаза 2 — контракт записи `Place` (M, ~1 день, риск: низкий-средний)

Кандидат №2. Список полей ведётся руками в 4 местах, update нетипизирован (`Record<string, unknown>`, `use-places.ts:9`); добавление поля = ~14 файлов.

1. `src/lib/place-fields.ts`: `PLACE_PATCHABLE` — единственный ручной список редактируемых полей (id/tripId/createdAt/authorId — не входят).
2. API:
   - `api/places/route.ts:9,19` — POST собирает `data` через pick по `PLACE_PATCHABLE` (тип из `Prisma.PlaceUncheckedCreateInput`);
   - `api/places/[id]/route.ts:17` — массив `allowed` заменён на `PLACE_PATCHABLE`.
3. Хуки: `useUpdatePlace` получает тип `Partial<Pick<Place, (typeof PLACE_PATCHABLE)[number]>>` вместо `Record<string, unknown>`; `useCreatePlace` — из Prisma-типа.
4. `select`-проекция в `api/trip/route.ts:28` пока остаётся (её судьба — фаза 3b).
5. Попутные дубли того же скоупа:
   - Google-ссылка маршрута ×3 → `src/lib/place-links.ts` (`PlaceRow.tsx:119`, `PlaceDialog.tsx:347`, `dashboard/TodayList.tsx:159`);
   - формат координат `toFixed(4)` ×4 → `formatLatLng` в `src/lib/utils.ts` (`add-place-sheet.tsx:130,175`, `map-picker.tsx:64,109`);
   - `CATEGORY_SHORT` (`PlaceDialog.tsx:63-76`) — вывести из `CATEGORY_META` (`lib/types.ts:177-190`).
6. Тест: `pickPatchable(body)` — чистая функция: неизвестные и запрещённые поля (`id`, `tripId`) отбрасываются.

**Готово, когда:** тест контракта зелёный; создание/редактирование места в UI работает; TS ловит попытку записать несуществующее поле.

---

## Фаза 3 — `useRoute`: единая модель чтения маршрута (M-L, ~1–2 дня, риск: средний)

Кандидат №1, главная рекомендация. Дни+места читаются дважды (`/api/days` + `/api/trip`) с разными проекциями; PlaceDialog держит «fresh»-костыль (`PlaceDialog.tsx:108-110`).

**Разведка перед началом:** выяснить у всех потребителей `useTrip()` (их ~12: achievements, app-shell ×2, ai-summary, budget-plan-widget, board, info-panel, gallery, invite-friends, journal, timeline, dashboard/*), кто реально читает `trip.days` / `trip.places`. Известные читатели: timeline (140,150,324), Dashboard.tsx:76, DashboardWidgets.tsx:7, app-shell.tsx:169, NextPlaceWidget, TodayList, RouteRail.

1. Создать `src/hooks/trip/use-route.ts`:
   - `useRoute()` — `useQuery(["route", tripId])` поверх **расширенного** `/api/days` (один серверный select: день + places + city/акцент);
   - селектор `buildRoute(days, currentDayNumber)` — чистая функция: `{ days, places: [{place, day}], cities, visitedCount }`.
2. Мигрировать потребителей в пределах скоупа «карта и маршруты»:
   - `trip-map.tsx:119,173` — оставить `useTrip()` только для `currency` (или перенести currency в `/api/days` и убрать второй fetch совсем);
   - `itinerary/Itinerary.tsx:34-35`;
   - `itinerary/PlaceDialog.tsx:96,146` — **удалить fresh-шим 108-110**: prop приходит из того же кэша;
   - `timeline.tsx:125,322-329` (`dayByDate` — из `useRoute`).
3. Централизовать контракт query-ключей: `src/lib/query-keys.ts` (`route`, `trip`, `photos-geo`); инвалидации из `use-websocket.ts:49-81`, `trip-switcher.tsx:164,207,223`, `template-picker.tsx:64` — через хелпер `invalidateRoute()` в `hooks/trip`, а не literals.
4. Инлайн-запрос `photos-geo` (`trip-map.tsx:161-171`) переехать в `hooks/trip/use-photos.ts`.
5. Тесты: `buildRoute` (группировка, cities, visitedCount) — чистые.
6. Ручная проверка realtime: два браузера, тогл «visited» у одного → у второго карта/маршрут/лента обновляются (WS-инвалидация теперь одного ключа).

**Фаза 3b (опционально, отдельная ветка):** мигрировать dashboard-виджеты с `trip.days` на `useRoute()` и **убрать** дни+места из ответа `/api/trip` (`api/trip/route.ts:23-28`). Выходит за скоуп аудита, но завершает его. Не делать в том же PR, что фаза 3 — потребители широкие.

**Готово, когда:** на вкладках карта/маршрут/лента — один сетевой запрос дней вместо двух; PlaceDialog без fresh-шима; realtime работает; тесты зелёные.

---

## Фаза 4 — `MapCanvas` + Focus bus + общие слои (L, ~2–3 дня, риск: высокий — регрессии UX)

Кандидаты №3 и №5. TripMap — 1071 строка, 17 useState/useRef; Leaflet-workarounds живут в компоненте страницы; picker уже разошёлся по basemap (CARTO в `map-picker-client.tsx:38-40`, от которого карта отказалась в `trip-map.tsx:41-59`).

1. **`src/lib/map-layers.ts`** — `TILE_LAYERS` переезжает; `map-picker-client.tsx` переключается на общий модуль. Самый дешёвый шаг фазы — сделать первым.
2. **`src/lib/map-bus.ts`** — `focus(place)` с exactly-once потреблением:
   - продюсеры: `gallery.tsx:228`, `PlaceRow.tsx:50`, `PlaceDialog.tsx:247,656`;
   - удалить `mapFocusTarget` из `trip-store.ts` и оба эффекта `trip-map.tsx:328-354` (включая таймер 50 мс — источник бага `ab2c928`).
3. **`src/components/trip/map/canvas.tsx`** — модуль `MapCanvas`, императивный интерфейс: `focusOn(place | point)`, `fitAll(points)`, `setLayer(key)`, `setAddMode() → center`, `destroy()`. Внутрь — всёLeaflet-хозяйство: `flyWhenReady`-ретраи (280-292), двойной `invalidateSize` (360-369), поллинг `movestart` (376-390), фабрики иконок и кэши (65-75), фолбэк-цепочка `initialCenter` (250-264).
4. **`route-threads.tsx`** — `RouteThreads` (1014-1071) вынести, построение сегментов сделать чистой функцией `buildRouteThreads(days)` (сортировка — `timeOrder` из фазы 1) с тестами.
5. **TripMap → композиция**: Canvas + Sheets (filters/layers) + Rail + RouteThreads. Целевой размер файла — 400–500 строк.
6. **MapFilters (попутно):** бейдж-формула и reset-литерал (`trip-map.tsx:219-224,796` ≡ `filters-sheet.tsx:45-50,178`) свести в один `useMapFilters()`; состояние `showPhotos/onlyPhotos/autoTheme` (140-141,138-139) — одно решение о persist вместо трёх стратегий хранения.
7. Тесты: `buildRouteThreads`, mapBus (fake timers, exactly-once). MapCanvas в jsdom не рендерится — интерфейсный тест через подменный adapter (fake canvas с тем же интерфейсом; seam `local-substitutable`).
8. Ручная проверка (регрессии): перетаскивание на мобильном (последний perf-фикс `732af38`), фокус из галереи и ленты, add-mode с центрированием, переключение слоёв, fullscreen, «нет активной поездки».

**Готово, когда:** ни один файл кроме `canvas.tsx` и `map-picker-client.tsx` не импортирует Leaflet; тайминги-фольклор и таймер 50 мс удалены; тесты зелёные; мобильный drag не деградировал.

---

## Фаза 5 — `PlaceForm` + `useReverseGeocode` (M, ~1 день, риск: низкий)

Кандидат №6. Create (8 `useState`, `add-place-sheet.tsx:108-165`) и edit (6 `useState` + ручной `editDirty`, `PlaceDialog.tsx:100-138`) — две state-машины над одними полями; `useGeocode`-мутация заставляет вызывающего дедуплицировать вручную (`geocodedFor`, 119-135).

1. `src/hooks/trip/use-geocode.ts`: `useReverseGeocode(lat, lng)` — query с кэшем по координатам; удалить мутацию `useGeocode` (`use-places.ts:77-85`) и `geocodedFor`.
2. `src/components/trip/place-form.tsx`: одна форма над `PlaceDraft` (типы из фазы 2); dirty-дифф — чистая функция `diffDraft(a, b)` с тестом.
3. `AddPlaceSheet` и `PlaceDialog` становятся тонкими хостами (раскладка + сабмит).

**Готово, когда:** поле формы добавляется один раз; повторный геозапрос на тех же координатах не бьёт в сеть; тесты зелёные.

---

## Фаза 6 — Sheet shell и мелочи UI (S, ~0.5–1 день, риск: низкий, кандидат опционален)

Кандидат №7 (Speculative) — делать последним, можно выкинуть из скоупа.

1. Доглубить существующий `mobile-bottom-sheet.tsx` → `Sheet`: portal + backdrop + drag-handle + sticky header + scroll-lock (`use-body-scroll-lock` уже есть) + a11y (`use-dialog-a11y` уже есть); интерфейс `open / onClose / title / children`. Примитив уже стандарт для остальных зон (gallery, journal, info-panel, phrasebook, admin-табы) — шесть панелей карты/маршрута единственные держат свои `createPortal`-копии. *(Поправка 2026-09-13: в исходном аудите неверно указано, что примитив использует только timeline.)*
2. Перевести шесть панелей: `filters-sheet.tsx:52-85`, `layers-sheet.tsx:70-94`, `add-place-sheet.tsx:46-75`, `PlaceDialog.tsx:264-323`, `DaySheet.tsx:121-151`, `map-picker.tsx:70-90`.
3. Мелочи:
   - герой «нет активной поездки» ×3 → один `EmptyTrip` (`trip-map.tsx:410-425`, `Itinerary.tsx:71-86`, `timeline.tsx:350-365`);
   - мёртвая ветка `AddDayButton` (`DaySheet.tsx:254-269`) — самостоятельная DaySheet-ветка не используется, удалить.
4. Проверка: все панели в мобильном вьюпорте (playwright, Edge-канал — Chrome на машине нет).

---

## Сводка

| Фаза | Кандидат | Размер | Зависит от | Даёт |
|---|---|---|---|---|
| 0 | vitest + CONTEXT.md | S | — | инструмент проверок для всех фаз |
| 1 | TimeOfDay | S | — | locality порядка дня; первые лёгкие тесты |
| 2 | Контракт Place | M | — | поле = 2 файла вместо 14 |
| 3 | useRoute | M-L | 1 (порядок дня) | один fetch, один queryKey, минус fresh-шим |
| 3b | ужать /api/trip | M | 3 | конец дубль-проекции (вне скоупа аудита) |
| 4 | MapCanvas + bus + layers | L | 1, 3 | 1071 → ~450 строк; Leaflet за одним seam |
| 5 | PlaceForm | M | 2 | одна форма, кэш геокода |
| 6 | Sheet shell | S | — | минус ~200 строк дублирования |

Итого ~7–10 рабочих дней в одиночку. Минимальный продающий срез: **фазы 0–3** (~3–4 дня) — уже дают главный эффект аудита без риска для UX карты.

## Открытые решения (не блокируют начало)

1. **Фаза 3b** — делать ли вовсе: требует миграции ~8 dashboard-файлов вне скоупа аудита.
2. **Currency в `/api/days`** (шаг 3.2) — если переносить, map избавляется от `useTrip()` целиком; иначе оставляет второй fetch ради одной валюте. Решить по коду `/api/days` при работе.
3. **Фаза 6** — в скоупе или нет.
