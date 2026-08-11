# TripTrek — бриф: Chill (Rest / RestChill)

> Для ИИ-агента: **только вкладка Chill**. Mobile-first (~99% телефон). Несколько участников одной поездки. Русский UI. Не рефакторить весь репо.

**Файлы:**
- UI: `src/components/trip/rest-chill.tsx` (~659 LOC: RestChill, NearbyView, NearbyCard, ChillCard, WishlistView)
- Таймер (мёртвый): `src/components/trip/rest-timer.tsx` — **нигде не импортируется**
- Вкладка: `src/app/page.tsx` (`activeTab === "rest"`), меню `app-shell.tsx` label «Chill»
- Хуки: `useDays`, `useUpdatePlace`, `useNearby` — `src/hooks/use-trip.ts`
- API: `src/app/api/nearby/route.ts`, `places/[id]/route.ts`, `days/route.ts`
- Realtime: `use-websocket.ts` (`place:*` → days)
- Категории: `CHILL_CATEGORIES = cafe|bar|restaurant` в `rest-chill.tsx`; на карте `mapOnlyChill` в `trip-store` / `trip-map.tsx`
- Wishlist: `localStorage["triptrek-wishlist"]` (только клиент)
- Empty-эталон: `dashboard.tsx`

**Смысл:** кафе/бары из маршрута + личный wishlist + «рядом» (OSM/Overpass); отметить посещение, рейтинг.

---

## P0

### 1. Нет empty/error при отсутствии поездки
- Без tripId `useDays` + API `default-trip` → чужие дни или ложное «Ничего не найдено».
- **Где:** `rest-chill.tsx`; `useDays`; `api/days` fallback.
- **Нужно:** empty как Обзор; `enabled: !!tripId`; API без default-trip.

### 2. `GET /api/nearby` — открытый прокси + Guangzhou default
- Битые/пустые coords → lat/lng Гуанчжоу; без auth/rate-limit.
- **Где:** `api/nearby/route.ts`.
- **Нужно:** session + rate-limit; без coords → 400; не China-default; User-Agent не `TripTrekChina`.

### 3. Places PATCH без auth/membership
- Visit/rating с Chill без проверки.
- **Где:** `api/places/[id]`; `useUpdatePlace` без `r.ok`.

### 4. `useNearby` глотает 500 как empty
- `return r.json()` без `r.ok` → UI «ничего не найдено».
- **Нужно:** throw; различать empty vs error + retry.

---

## P1

### 5. Wishlist только на устройстве, на все поездки
- Не в БД, не WS, не виден компании; copy «Хочу» выглядит как фича группы.
- **Минимум:** ключ `triptrek-wishlist:${tripId}` + честный copy («только на этом телефоне»).
- **Идеал:** серверный wishlist (отдельное ТЗ).

### 6. Wishlist state / LS рассинхрон при add
- Пишут в LS напрямую; единый helper load/save.

### 7. Visit/rating без pending / ok-check; нет «кто отметил»
- Toast сразу; double-tap; UI не шлёт `userName` в PATCH (API умеет в emit).

### 8. Empty не различает: нет chill-мест / фильтр / нет дней
- CTA в Маршрут; «сбросьте фильтр»; «сначала дни».

### 9. Бюджет места всегда `$`
- Валюта из `useTrip().settings.currency`.

### 10. China copy на Nearby / EN hero «Rest & Chill»
- Trip-agnostic + RU eyebrow.

### 11. `RestTimer` orphan
- Встроить под hero **или** оставить; не удалять молча.

### 12. Карточки не ведут в день/карту
- `setSelectedDay` + itinerary/map.

### 13. Nearby: `key={i}`; дедуп wishlist по имени → коллизии
- Ключ lat+lng+name / osm id.

### 14. `cachedGeo` модуля — сбрасывать при смене trip

---

## P2

### 15. Mobile: сегмент Маршрут/Хочу/Рядом — hit ≥44px
### 16. Лейблы «Рестораны» vs Nearby «Еда» — выровнять
### 17. Hero-метрики: wishlist/nearby count
### 18. Синхрон `CHILL_CATEGORIES` с `mapOnlyChill` на Карте → общий const
### 19. a11y labels на visit/stars
### 20. Меньше motion на длинном списке
### 21. Опционально: nearby → create place в день

---

## Definition of Done

- [ ] Нет tripId → empty Обзора, не default-trip
- [ ] days + nearby + places PATCH: enabled/auth; nearby без GZ-default; ошибки ≠ empty
- [ ] Wishlist изолирован по trip (+ честный copy)
- [ ] Visit/rating: pending + ok; валюта поездки
- [ ] Разные empty; mobile CTA; смена trip без чужого маршрута
- [ ] Smoke: 2 юзера видят visit; Nearby честно; wishlist не смешивается между tripId

## Чего не делать

- Не Prisma wishlist без ТЗ.
- Не удалять `rest-timer` молча.
- Не ломать Overpass без fallback-цепочки.
- Не коммитить без просьбы.
