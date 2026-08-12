# TripTrek — бриф: Лента (Timeline)

> Для ИИ-агента: **только исправить/допилить Ленту** по списку ниже. Не рефакторить весь проект. Mobile-first (~99% телефон). Мультипользовательская поездка. UX на русском.

**Файлы:**
- UI: `src/components/trip/timeline.tsx`
- Вкладка: `src/app/page.tsx` (`activeTab === "timeline"`), пункт меню в `src/components/trip/app-shell.tsx`
- Хуки: `src/hooks/use-trip.ts` — `useTrip`, `useExpenses`, `usePhotos`, `useJournal` (журнал не подключён), `useBoard` (чат не в ленте)
- API: `src/app/api/trip/route.ts`, `expenses/route.ts`, `photos/route.ts`, `journal/route.ts`, `board/route.ts`
- Realtime: `src/hooks/use-websocket.ts`

**Смысл экрана:** хронология «что произошло в поездке» для всей компании на телефоне.

---

## P0 — данные / безопасность

### 1. Нет empty/error при отсутствии поездки
- **Сейчас:** крутится логика `tripLoading`; при пустом `tripId` `useTrip` не фетчит → `events=[]` → текст «Пока нет событий» (ложь).
- **Нужно:** как на Обзоре — empty «нет поездки» + CTA создать/join; при `isError` — retry.
- **Где:** `timeline.tsx`, `useCurrentTripId` / `useTrip` из `use-trip.ts`, `setTripSwitcherOpen` из `trip-store`.

### 2. `GET /api/photos` без tripId отдаёт все фото БД
- **Сейчас:** `usePhotos` всегда ставит `tripId` из `getTripId()`; если `""`, на сервере `where={}` → все фото → лента может показать чужие.
- **Нужно:** API требует `tripId` (+ membership); хук `enabled: !!tripId`.
- **Где:** `src/app/api/photos/route.ts`, `usePhotos` в `use-trip.ts`.
- Expenses при пустом tripId сейчас `[]` — тоже лучше явный 400 + `enabled`.

### 3. API без auth/membership
- Чтение `trip` / `photos` / `expenses` / `journal` по `tripId` без сессии.
- **Нужно:** `requireTripMember` (см. общий `FIX-BRIEF.md`).
- **Где:** соответствующие `route.ts`.

---

## P1 — неполная / неверная лента

### 4. Дневник задуман, но вырезан
- В `timeline.tsx` stub: `// journals нет в trip, пропускаем`.
- `useJournal()` и `/api/journal` есть.
- **Нужно:** подключить `useJournal()`, события `type: "journal"` (автор, mood, день, превью).
- **Где:** `timeline.tsx`.

### 5. Сообщения доски (Чат) не в ленте
- Для ленты компании логичны посты board.
- **Нужно:** опционально `useBoard()` → события; или явно исключить в copy («лента: места, фото, траты, дневник»).
- **Где:** `timeline.tsx`, `api/board/route.ts`.

### 6. Места только `status === "visited"`
- Запланированные/созданные не видны.
- Либо оставить (лента = «что случилось») и честный empty-copy, либо фильтр типов.
- **Где:** сбор events в `timeline.tsx`.

### 7. Время места: `visitedAt || day.date`
- Без `visitedAt` событие падает на дату дня → кривая группировка/сортировка.
- При mark visited API пишет `visitedAt` (`places/[id]/route.ts`); для старых данных — fallback + пометка.
- **Где:** `timeline.tsx`.

### 8. Траты всегда `$`
- `subtitle: \`$${e.amount}\`` — игнор `trip.settings.currency`.
- **Где:** `timeline.tsx`.

### 9. Settlement как обычные траты
- `category === "settlement"` засоряет ленту.
- Фильтровать или отдельный тип «перевод».
- **Где:** `timeline.tsx`, категории в `src/lib/types.ts`.

### 10. Группировка дат без года
- `toLocaleDateString(..., { day, month })` → ключ `"5 октября"`; разные годы склеятся.
- **Нужно:** ISO `YYYY-MM-DD` + красивый заголовок с годом.
- **Где:** `grouped` в `timeline.tsx`.

### 11. Битый timestamp → NaN в sort
- Guard / в конец списка.
- **Где:** sort events в `timeline.tsx`.

### 12. Stale при смене поездки
- `usePhotos` / `useExpenses`: `getTripId()` при сборке params; нет `enabled`.
- **Нужно:** `useCurrentTripId()`, `enabled: !!tripId`, в `queryFn` свежий id.
- **Где:** `use-trip.ts` (влияет и на другие экраны).

---

## P1 — UX / mobile / компания

### 13. Empty state слабый
- Нет CTA на маршрут / фото / бюджет / дневник.
- **Где:** `timeline.tsx` + `useTripStore().setActiveTab`.

### 14. Карточки не кликабельны
- Фото → gallery, трата → budget, место → itinerary (день), journal → journal.
- Сейчас `div`. Нужны `button` + store.
- **Где:** `timeline.tsx`.

### 15. Автор места не показан
- У фото/трат есть имя; у place — только день/город.
- В модели нет `visitedBy` — добавить при PATCH status или не обещать «кто отметил».
- Важно для нескольких участников.

### 16. Нет фильтров-чипов
- Все / Места / Фото / Траты / Дневник.
- **Где:** `timeline.tsx` local state.

### 17. Нет лимита / тяжёлый motion
- Все события в DOM + `delay: i * 0.05` → лаги на телефоне при 100+.
- Убрать delay по индексу или «Показать ещё» (30–50).

### 18. Hero «N событий»
- Нет разбивки по типам (честные метрики).

### 19. Realtime
- WS уже invalidate photos/expenses/trip; после journal — тоже.
- Опционально: подсветка «только что».

### 20. Мини-фото
- Двойной `photos.find`; не используется `thumbUrl`.
- **Где:** `timeline.tsx`.

---

## P2 — код / мелочи

### 21. Мёртвые импорты
- `CITIES`, `Expense`, `BookOpen`; пустой journal-цикл.

### 22. Опционально `GET /api/feed?tripId=`
- Серверная склейка + sort + limit + membership. Не обязательно в первой итерации.

### 23. a11y
- `alt=""` у фото → caption / «Фото».
- Опционально относительное время «5 мин назад».

### 24. Loading photos/expenses
- Ждётся только trip → скачок списка. Учитывать loading всех источников.

### 25. Стиль hero
- `indigo/purple` — выровнять под общий бренд при желании (не блокер).

---

## Definition of Done (Лента)

- [ ] Нет поездки → empty как Обзор, не «нет событий»
- [ ] Данные только своей поездки + auth/membership
- [ ] События: visited places, photos, expenses (settlement отдельно/скрыты), journals
- [ ] Валюта поездки; даты с годом; фильтры; клики
- [ ] Mobile: без лагов на длинном списке, CTA в empty, тач-зоны ≥44px
- [ ] Смена поездки не показывает чужие/старые события

## Чего не делать

- Не переписывать весь `use-trip.ts` ради ленты (точечно `enabled` / tripId).
- Не делать redesign всего приложения.
- Не открывать API наружу без auth.
