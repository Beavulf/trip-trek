# TripTrek — бриф: Маршрут (Itinerary)

> Для ИИ-агента: **только Маршрут** (дни + места). Mobile-first (~99% телефон). Несколько участников одной поездки. Не делать общий рефакторинг репо. Русский UI.

**Файлы:**
- UI: `src/components/trip/itinerary.tsx` (~700 LOC, god-файл экрана)
- Sheet добавления места: `src/components/trip/add-place-sheet.tsx`
- Город: `src/components/trip/city-autocomplete.tsx`
- Вкладка: `src/app/page.tsx` → `activeTab === "itinerary"`; меню в `app-shell.tsx` («Маршрут»)
- Store: `selectedDay` / `setSelectedDay` в `src/lib/trip-store.ts` (Обзор/Лента тоже ставят день)
- Хуки: `useDays`, `useAddDay`, `useDeleteDay`, `useUpdateDay`, `useUpdatePlace`, `useCreatePlace`, `useDeletePlace`, `useUploadPhoto` — `src/hooks/use-trip.ts`
- API: `src/app/api/days/route.ts`, `src/app/api/places/route.ts`, `src/app/api/places/[id]/route.ts`, фото `src/app/api/photos/route.ts`
- Realtime: WS `place:created|updated|deleted` → invalidate `days`/`trip` в `use-websocket.ts`

**Смысл:** список дней поездки, места по дням, отметить посещённым, заметки/рейтинг/фото, добавить день/место — совместно с друзьями.

---

## P0 — безопасность / целостность данных

### 1. API days/places без auth и membership
- Любой с `tripId` / `placeId` может читать дни, создавать/менять/удалять места и дни.
- **Где:** `api/days/route.ts`, `api/places/route.ts`, `api/places/[id]/route.ts`.
- **Нужно:** `requireTripMember`; мутации — только члены поездки (удаление дня — желательно owner, или любой member — зафиксировать правило и соблюсти в UI+API).

### 2. `GET /api/days` fallback `"default-trip"`
- `tripId = searchParams.get("tripId") || "default-trip"` — при пустом id тянет чужой/несуществующий seed.
- **Где:** `api/days/route.ts` строка ~7.
- **Нужно:** без tripId → `400` или `[]`; на клиенте `enabled: !!tripId`.

### 3. Хуки без `enabled` / слабый tripId
- `useDays`: `queryKey: ["days"]` **без** tripId; всегда fetch.
- `useUpdatePlace` / `useDeletePlace`: **не проверяют** `r.ok` → UI показывает success toast при ошибке.
- **Где:** `use-trip.ts`.
- **Нужно:** `queryKey: ["days", tripId]`, `enabled: !!tripId`; на mutate — throw если `!ok`, toast.error в UI.

### 4. Удаление места: toast success до подтверждения сервера
- `DeletePlaceButton`: `del.mutate(placeId); toast.success(...)` сразу.
- То же риск у toggle visited / save notes.
- **Где:** `itinerary.tsx` `DeletePlaceButton`, `PlaceRow.toggle`, `PlaceDialog`.

---

## P0 / P1 — пустая поездка и добавление места

### 5. Нет дней → всё равно «+ место», `dayId` может быть `undefined`
- `openAdd()`: `dayId: currentDay?.id`; при `days=[]` → `AddPlaceSheet` с битым dayId → API 400.
- Fallback координат: неизвестный город → **Гуанчжоу** (`cityCoords.guangzhou`).
- **Где:** `itinerary.tsx` `openAdd` (~46–60).
- **Нужно:** если нет дней — disable «+» + toast «сначала добавьте день»; координаты из `CITIES` / первого места дня / lat-lng из `cityKey` custom (`custom-lat-lng`), **не** Guangzhou по умолчанию.

### 6. Empty state маршрута слабый
- `isLoading || !days` → skeleton; `days=[]` → только чипы «Все дни» + AddDay, без объяснения.
- Нет привязки к «нет активной поездки» (пустой tripId).
- **Нужно:** empty как на Обзоре (нет trip / нет дней + CTA).

### 7. Ложный промис при добавлении дня
- В UI: «После создания дня автоматически добавятся фразы… и погода» (`AddDayButton` ~636–639).
- API `POST /api/days` **только** создаёт Day + `totalDays` — **не** вызывает phrases/generate и не трогает weather.
- **Где:** `itinerary.tsx` + `api/days/route.ts`.
- **Нужно:** либо реально вызвать generate/погоду, либо убрать вводящий в заблуждение текст.

---

## P1 — логика дней / мест

### 8. Фото в карточке места обрезаны
- `GET /api/days` include photos `take: 8` на **весь день**, не на place.
- `PlaceDialog` фильтрует `day.photos` по `placeId` — фото места могут не попасть в эти 8.
- **Где:** `api/days/route.ts`, `PlaceDialog` в `itinerary.tsx`.
- **Нужно:** `usePhotos(dayId, placeId)` в диалоге или отдельный fetch; не опираться на урезанный include.

### 9. Заметки в PlaceDialog не сбрасываются при смене места
- `const [notes, setNotes] = useState("")`; при открытии другого place старый `notes` / склейка с `place.notes` через `value={notes || place.notes || ""}` глючит.
- **Где:** `PlaceDialog`.
- **Нужно:** `useEffect` при `place.id` → `setNotes(place.notes || "")` или `key={place.id}` на форму.

### 10. Нет редактирования дня (город/title/цвет) в UI
- API `PATCH /api/days` есть (`useUpdateDay` в хуках).
- В itinerary только add/delete day — **нет** edit day.
- Пользователь не может исправить опечатку города без костылей.
- **Где:** добавить UI в `DayCard` / sheet; хук уже есть.

### 11. Порядок мест (`order`) не управляется в UI
- При create считается `order`; drag-and-drop / «вверх-вниз» нет (хотя в зависимостях есть `@dnd-kit`).
- На телефоне важен порядок «утро → вечер».
- **Где:** `itinerary.tsx` + PATCH place `order` (поле уже в allowed? сейчас в `[id]` allowed нет `order` — добавить в API + UI).

### 12. Статус только planned ↔ visited
- В типах есть `"current"`; UI не использует.
- Нет «пропущено» / «закрыто».
- Не блокер; зафиксировать 2 статуса или поддержать current.

### 13. Кто отметил посещение — не видно
- Для компании важно имя; в Place нет `visitedByUserId`.
- PATCH шлёт `userName` только в WS payload, в БД не пишет.
- **Нужно:** поле в схеме или хотя бы показывать из сессии при эмите; UI «отметил @Имя».

### 14. Удаление единственного дня запрещено API — ок
- UI показывает кнопку удаления всегда; при 1 дне — error toast (если onError).
- **Улучшение:** disabled + tooltip «нельзя удалить единственный день» когда `days.length === 1`.

### 15. После delete day `selectedDay` в store может указывать на несуществующий номер
- Обзор/фильтр «День N» пустой.
- **Где:** `useDeleteDay` onSuccess → `setSelectedDay(null)` или clamp.

### 16. `POST /api/days` двигает `totalDays`, но не `endDate`
- Расхождение с датами на Обзоре.
- **Где:** `api/days/route.ts` + при необходимости sync endDate.

### 17. Ссылка «Как добраться»
- `https://www.openstreetmap.org/directions?from=&to=lat%2Clng` — часто неудобна на мобиле; лучше `https://www.google.com/maps/dir/?api=1&destination=lat,lng` или geo: URI с выбором.
- **Где:** `PlaceRow` в `itinerary.tsx`.

---

## P1 — UX / mobile / компания

### 18. Чипы дней: мелкий hit-area, нет «ещё →»
- `py-1.5` text-xs; на телефоне легко промахнуться; длинный список дней без градиента/скролл-хинта.
- **Нужно:** min-h ~44px на чипах и кнопке +, sticky фильтр при скролле.

### 19. Delete day vs expand header
- Клик по шапке дня toggle expand; корзина с `stopPropagation` — ок, но confirm «Удалить?» крошечный (`text-[10px]`).
- На мобиле лучше bottom-sheet confirm.

### 20. PlaceDialog: notes controlled плохо + нет «отменить заметку»
- См. п.9; кнопка сохранить появляется только если `notes !== place.notes`.

### 21. Upload фото: нет userId / ошибки
- `onFile` не передаёт `userId` в FormData → фото без автора в галерее/ленте.
- Нет try/catch → silent fail возможен.
- **Где:** `PlaceDialog.onFile`; сессия из `useAuth`.

### 22. Realtime: другой участник видит обновление days
- WS invalidate есть — ок.
- Нет визуала «друг отметил место» на строке (только toast из notification, если эмит с userName).
- Проверить, что клиентский toggle передаёт `userName` в PATCH body (сейчас `PlaceRow` **не** передаёт).

### 23. Бюджет места с `$` иконкой DollarSign
- Не валюта поездки (`trip.settings.currency`).
- **Где:** `PlaceRow`; подтянуть currency через `useTrip` или props.

### 24. Пустой день (0 мест)
- В expanded — пустой список без CTA «добавить место на этот день».
- **Нужно:** кнопка в `DayCard` → `openAdd` с `dayId` этого дня.

### 25. Фильтр `selectedDay` с Обзора
- Приход с Обзора с выбранным днём — ок.
- Нет кнопки «сбросить» кроме «Все дни»; ок, но «Все дни» тоже мелкий чип.

---

## P2 — код / структура

### 26. God-файл `itinerary.tsx`
- DayCard, PlaceRow, PlaceDialog, AddDay, Delete* в одном файле ~700 строк.
- Имеет смысл разрезать при правках: `itinerary/DayCard.tsx`, `PlaceDialog.tsx`, … (не обязательно до фикса багов).

### 27. Дублирование cityCoords
- Хардкод Guangzhou/… в `openAdd`; то же в weather/CITIES.
- Вынести в `lib/cities.ts` или использовать `CITIES` + parse `custom-{lat}-{lng}`.

### 28. AnimatePresence у PlaceDialog
- `place && portal` — exit-анимация часто не играет (unmount сразу).
- Мелочь.

### 29. `useDays` в PlaceDialog назван `trip`
- `const { data: trip } = useDays()` — путаница имён (это days[]).

### 30. Нет сортировки мест по timeOfDay в UI
- API order by `order`; если order не выставлен логично — утро/вечер вперемешку.
- Опционально secondary sort morning < afternoon < evening.

---

## Definition of Done (Маршрут)

- [ ] Нет trip / нет дней → честный empty + CTA; «+ место» без дня невозможно
- [ ] days/places API с auth + membership; нет `default-trip`
- [ ] mutate place/day: проверка ok, честные toast; notes/photos корректны
- [ ] Добавление дня: либо реальные фразы/погода, либо честный copy
- [ ] Фото места грузятся полностью; автор фото/visit для компании
- [ ] Mobile: крупные чипы/кнопки, empty day CTA, confirm удаления удобен
- [ ] Смена поездки / selectedDay не ломает список; realtime обновляет дни у всех

## Чего не делать

- Не переписывать карту (отдельный таб Map) в этом брифе.
- Не обязательный full DnD, если сделаете хотя бы ↑↓ или edit order.
- Не менять схему Prisma без нужды (visitedBy — желательно, но можно отложить с честным UI).

## Быстрый чеклист файлов для правок

| Задача | Файл |
|--------|------|
| Empty / disable + / coords | `itinerary.tsx` |
| Add place form | `add-place-sheet.tsx` |
| Days API default-trip, endDate | `api/days/route.ts` |
| Places auth, order in PATCH | `api/places/*.ts` |
| Hooks enabled, ok-check | `use-trip.ts` |
| Photos в диалоге | `itinerary.tsx` + `usePhotos` |
| Ложный текст фраз | `AddDayButton` в `itinerary.tsx` |
