# TripTrek — бриф: Карта (Map)

> Для ИИ-агента: **только вкладка «Карта»**. Mobile-first (~99% телефон). Несколько участников одной поездки. Русский UI. Не рефакторить весь репо.

**Файлы:**
- UI: `src/components/trip/trip-map.tsx`
- Sheet места: `src/components/trip/add-place-sheet.tsx` (открывается с карты)
- Dynamic import: `src/app/page.tsx` (`TripMap`, `ssr: false`)
- Store: `src/lib/trip-store.ts` — `mapCityFilter`, `mapOnlyUnvisited`, `mapOnlyChill` (persist)
- Хуки: `useDays`, `useCreatePlace`, `useUpdatePlace`, `useGeocode`, `getTripId` / `useCurrentTripId` — `src/hooks/use-trip.ts`
- API: `src/app/api/days/route.ts`, `places/route.ts`, `places/[id]/route.ts`, `geocode/route.ts`, `nearby/route.ts`, `photos/geo/route.ts`
- Realtime: `src/hooks/use-websocket.ts` (`place:*` → days; фото на карте — см. P1)
- Города: `src/lib/types.ts` (`CITIES` — в основном China)
- Стили: `src/app/globals.css` (Leaflet; zoom скрыт на mobile)
- **Не** этот таб: `transport-map.tsx` (мёртвый China-экран, не в TABS)

**Смысл:** Leaflet — места + фото с GPS, фильтры, тап → добавить место, popup → отметить посещённым.

---

## P0 — безопасность / краш / утечки

### 1. API days/places/photos-geo без auth/membership
- Любой с `tripId`/`placeId` читает и мутирует.
- **Где:** `api/days`, `places`, `places/[id]`, `photos/geo`.
- **Нужно:** `requireTripMember` (как в брифах Маршрута/FIX-BRIEF).

### 2. `GET /api/days` → fallback `"default-trip"`
- **Где:** `days/route.ts` ~`|| "default-trip"`.
- **Нужно:** без tripId → 400/`[]`; клиент `enabled: !!tripId`.

### 3. `useDays` без tripId в ключе / без `enabled`
- Пустой tripId + API fallback; stale при смене поездки.
- **Где:** `use-trip.ts`; карта `trip-map.tsx`.
- **Нужно:** `["days", tripId]`, `enabled: !!tripId`; сброс map-фильтров при смене trip.

### 4. `photos/geo` без tripId = все geo-фото БД
- **Где:** `api/photos/geo/route.ts`; fetch в `trip-map.tsx`.
- **Нужно:** обязательный tripId + membership; `enabled: !!tripId`.

### 5. Geocode / Nearby — открытый прокси без auth/rate-limit
- Nearby дефолтит на Гуанчжоу.
- **Где:** `api/geocode/route.ts`, `api/nearby/route.ts`.
- **Нужно:** session + rate-limit; не China-default.

### 6. Краш `CITIES.find(...)!` при чужом `mapCityFilter`
- Persist фильтра (напр. tokyo) + `CITIES` только China → `undefined!`.
- **Где:** `trip-map.tsx` центр/чипы; `trip-store` persist.
- **Нужно:** safe fallback; чипы из дней **текущей** поездки; сброс фильтра при switch trip.

### 7. XSS в фото-пине
- `makePhotoIcon` вставляет `thumbUrl` в `html:` без экранирования.
- **Где:** `trip-map.tsx` ~makePhotoIcon.
- **Нужно:** не сырой HTML / encode / DOM API.

---

## P1 — empty / China / UX / realtime

### 8. Нет empty «нет поездки» / «нет дней»
- Только «Загрузка карты…» или пустая карта с China-центром.
- **Нужно:** как Обзор — CTA; disable add без дня.

### 9. Хардкод China: центр, чипы, VPN/Amap copy
- Центр «все» ≈ Pearl River Delta; чипы из `CITIES`.
- **Нужно:** центр/bounds из мест поездки; чипы из `day.cityKey` + coords.

### 10. Add с карты: неверный `dayId`
- С фильтром города → первый день с `cityKey`; без → `days[0]`.
- **Нужно:** выбор дня / ближайший день по coords; не сабмит без дней.

### 11. Visit из popup: toast без `r.ok`
- `useUpdatePlace` не проверяет ok.
- **Где:** `use-trip.ts`, `PlacePopup` в `trip-map.tsx`.

### 12. Geocode: setState во время render
- **Где:** `add-place-sheet.tsx` ~geoDone/mutate в теле рендера.
- **Нужно:** `useEffect`.

### 13. Realtime: фото на карте не обновляются
- WS `photo:added` invalidates `["photos"]`, не `["photos-geo", tripId]`.
- **Где:** `use-websocket.ts`, `trip-map.tsx`.

### 14. Mobile: zoom controls скрыты CSS
- `.leaflet-control-zoom { display: none }` + `scrollWheelZoom={false}`.
- **Где:** `globals.css`, `trip-map.tsx`.
- **Нужно:** ± на mobile или кастомные кнопки.

### 15. Фильтры/слои съедают высоту карты
- `h-[55vh]` + много контролов.
- **Нужно:** collapsible фильтры; слои в одном меню.

### 16. Нет fitBounds / валидации lat-lng
- Режим «все» zoom 8 на China — места других стран вне экрана.
- **Нужно:** skip NaN; `fitBounds` по filtered.

### 17. Persist map-фильтров между поездками
- **Где:** `trip-store.ts`; сброс в `trip-switcher` / `setCurrentTripId`.

### 18. Popup «Отметить» без pending / double-tap
- **Где:** `PlacePopup`.

---

## P2

### 19. Новый `L.divIcon` на каждый render — кэшировать
### 20. `MapContainer key={mapCityFilter}` remount — лучше flyTo
### 21. Фильтр «Кафе» узкий vs CATEGORY_META
### 22. Нет «открыть в навигаторе» из popup (в itinerary есть)
### 23. `transport-map.tsx` — не трогать в этой задаче
### 24. `useNearby` — не на карте (Chill); hardening nearby API — общий

---

## Definition of Done

- [ ] Нет trip/дней → empty + CTA; add без дня невозможен
- [ ] days/places/photos-geo/geocode(+nearby) с auth; нет default-trip / leak geo
- [ ] Фильтры/центр из текущей поездки; нет краша CITIES; сброс persist
- [ ] Add-from-map: верный dayId; geocode в useEffect; create ok-check
- [ ] Visit: ok + pending; realtime days; photos-geo invalidate
- [ ] Нет XSS в пинах; mobile зум; fitBounds
- [ ] Нет China-only UI для не-China поездок

## Чего не делать

- Не переписывать Маршрут/Chill/Gallery целиком.
- Не подключать `transport-map.tsx` здесь.
- Не менять тайлы «ради красоты», если China-доступ OSM критичен — сделай copy trip-aware.
- Не коммитить без просьбы.
