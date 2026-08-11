# TripTrek — бриф: Погода (WeatherPanel)

> Для ИИ-агента: **только вкладка Погода**. Mobile-first. Несколько городов из дней маршрута. Русский UI.  
> Эталон UX: `dashboard.tsx` → `WeatherWidget` (error + places coords). Shared auth/`default-trip` на days — по `FIX-BRIEF` / Обзору.

**Файлы:**
- UI: `src/components/trip/weather-panel.tsx`
- Хуки: `useWeather`, `useWeatherByCoords`, `useDays` — `use-trip.ts`
- API: `src/app/api/weather/route.ts` (open-meteo)
- Типы: `Weather`, `WeatherDay`, `CITIES` — `src/lib/types.ts` (**только 4 города Китая**)
- Вкладка: `page.tsx` (`weather`), `app-shell` «Погода»
- Дни / `custom-*`: `itinerary.tsx` AddDay; `city-autocomplete` + `api/city-search`
- Days API: `api/days/route.ts` (default `cityKey: "custom"`; возможен `default-trip`)
- Prisma Day: **нет** lat/lng/timezone
- Шаблоны: `trip-templates.ts` (guangzhou, tokyo, paris…)

**Смысл:** города из unique `cityKey` дней → current + 7-day forecast. Обзор и Погода **не синхронизированы**.

### Уже сделано (не ломать)
Unknown `?city=` → **400**, не fallback на Гуанчжоу (`route.ts` ~64–70). `FIX-BRIEF` E1 по коду закрыт.

### Другой silent fallback
При падении open-meteo → 200 + fake `temperature: 28`, `fallback: true`. Panel `fallback` **не показывает**.

---

## Расхождения словарей

| Источник | Ключи |
|----------|--------|
| `types.CITIES` | guangzhou, shenzhen, hongkong, macau |
| `LEGACY_CITIES` (weather route) | + tokyo, paris, bangkok, phuket |
| itinerary `cityCoords` | те же 8 |

Panel coords: только `CITIES` или parse `custom-{lat}-{lng}`.  
`tokyo`/`paris` → legacy string (ок), но двойной fetch (см. P0).  
Autocomplete: `custom-${lat}-${lng}` (timezone теряется). Без выбора: `cityKey: "custom"` → нет coords.

---

## P0

### 1. Двойной fetch + Null Island `(0,0)`
- Всегда оба хука; без coords → `lat\|\|0`, `lng\|\|0` → ready → погода в океане; параллельно legacy на `custom-*` → 400.
- **Где:** `weather-panel.tsx` ~61–72; `useWeatherByCoords` ~331–342
- **Нужно:** **один** путь. Coords только при реальных coords (`!== 0,0`); legacy только без coords и ключ ∈ legacy.

### 2. День `cityKey: "custom"` без autocomplete
- → `useWeather("custom")` → 400 → пустой hero.
- **Нужно:** «Нет координат — выберите город в Маршруте»; опционально places fallback как на Обзоре.

### 3. Отрицательные coords в `custom-*`
- `split("-")` ломает `custom--33.86-151.2` → NaN.
- **Нужно:** надёжный encode/decode (`custom:{lat},{lng}` или regex); не ломать существующие положительные ключи.

### 4. Loading дней = ложный empty
- `days` undefined → `cities=[]` → «Добавьте дни…»
- **Нужно:** loading / нет trip / нет дней / ок. `!tripId` — CTA как на Обзоре, не «добавьте дни».

---

## P1

### 5. Нет error / fallback UI
- 400/сеть → пустой hero; `fallback: true` выглядит как реальная 28°.
- **Нужно:** ошибка + retry; бейдж «примерные данные».

### 6. `CITIES` vs `LEGACY` рассинхрон
- Panel знает coords только China-4.
- **Нужно:** один shared map (key, lat/lng, timezone, color) для UI и API.

### 7. Default `|| "guangzhou"` в panel
- **Где:** `weather-panel.tsx` ~69
- **Нужно:** убрать; без города — не запрашивать.

### 8. Timezone не хранится / `WeatherCity.timezone` мёртв
- Autocomplete даёт tz, Day нет → `timezone=auto`.
- **Минимум:** не обещать точный local day; опционально хранить tz в Day/key.

### 9. `useDays` без tripId / API `default-trip`
- queryKey без tripId; empty tripId → чужие/seed дни.
- **Нужно:** `enabled: !!tripId`, key `["days", tripId]`; не `default-trip` (согласовать с Обзором). В scope Погоды — хотя бы честный empty при `!tripId`.

### 10. Нет places coords fallback
- Обзор берёт lat/lng места; Погода — нет.
- **Нужно:** known city → parse custom → first place дня.

---

## P2

### 11. Mobile chips: safe-area, не уезжать за край
### 12. «Сегодня/Завтра» по TZ браузера vs города
### 13. При `forecast: []` (API fallback) — пояснение
### 14. Градиент indigo `#6366f1` — слабый smell; второй цвет из accent города
### 15. Deep-link с Обзора WeatherWidget → tab weather (опционально)
### 16. Подпись «N дней» / текущий city по currentDay

---

## Definition of Done

- [ ] Unknown city → 400, никогда GZ/чужой default
- [ ] Один weather-запрос; нет `(0,0)`
- [ ] Empty: нет trip / loading / нет дней / нет coords — разные RU-сообщения
- [ ] Ошибка API и `fallback: true` видимы
- [ ] Multi-city chips обновляют current + 7-day
- [ ] Отрицательные lat/lng в custom работают (или новый формат + совместимость)
- [ ] tokyo/paris/bangkok + China legacy → верные coords (shared dict)
- [ ] Mobile: chips + `pb-20`/safe-area
- [ ] Ближе к WeatherWidget (coords fallback + error); shared helper ок
- [ ] Smoke: empty trip; China template; Japan template; autocomplete western city; `?city=moscow` → 400

## Don'ts

- Не возвращать silent GZ/default city
- Не чинить только API, оставляя двойной fetch и `|| 0`
- Не большой рефактор `use-trip` / app-shell
- Не платные weather API
- Не ломать существующие `custom-23.12-113.26`
- Не Prisma-migrate без нужды (хватит encode + places fallback)
- Не переписывать Dashboard WeatherWidget «для красоты»

## Порядок

1. Shared `resolveCityCoords` + encode/decode custom  
2. Panel: один hook, loading/empty/error/fallback  
3. Убрать guangzhou default; shared dictionary  
4. Places fallback + useDays enabled  
5. Mobile smoke + API probe

## Быстрые проверки

```
GET /api/weather?city=moscow          → 400
GET /api/weather?city=guangzhou&forecast=7 → 200
GET /api/weather?lat=35.68&lng=139.69&name=Tokyo&forecast=7 → 200
UI: без дней → empty; 2+ города → chips; custom без мест → empty coords
```
