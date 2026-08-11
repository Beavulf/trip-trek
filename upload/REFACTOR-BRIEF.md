# TripTrek — бриф на рефакторинг (для ИИ-агента)

> **Контекст:** Ты уже делала этот проект (TripTrek). Сейчас нужно **не добавлять фичи**, а привести архитектуру в порядок: разрезать god-файлы, вынести фичи в отдельные папки, закрыть дыры безопасности, убрать China-хардкоды и мусор. Поведение для пользователя должно остаться тем же (regression = баг).

**Стек:** Next.js 16, React 19, Tailwind 4 + shadcn, Prisma (SQLite), TanStack Query, Zustand, Socket.io, Bun (`server.ts`), Web Push.

**Корень проекта:** рабочая папка уже распакована. Не трогай `src/components/ui/**` (shadcn) без крайней нужды.

---

## Цель (Definition of Done)

1. Ни один **наш** исходник (кроме shadcn `ui/`) не больше **~350–400 строк**. Идеал: **≤250**.
2. Хуки и типы разбиты **по фичам**, не один `use-trip.ts`.
3. Бизнес-логика (долги, settlement, split) — в `lib/`, покрыта простыми unit-тестами или хотя бы чистыми функциями без React.
4. Все мутирующие API (`POST/PATCH/DELETE`) и чувствительные `GET` проверяют **сессию + membership в trip**.
5. Нет хардкода «China / guangzhou / default-trip» в UI как единственного мира; дефолты — из текущей поездки или нейтральные.
6. Корень репо чистый: QA-скриншоты и `.tar` убраны/перенесены; `worklog.md` можно оставить или в `docs/`.
7. `bun run build` (или `npm`/`bun` как принято в проекте) проходит; основные табы открываются без runtime-ошибок.
8. Публичные импорты сохранены через barrel/`index.ts` где нужно — **минимальный churn** внешних API (`@/hooks/use-trip` может остаться re-export на переходный период).

---

## Жёсткие правила работы

- **Не меняй UX/копирайт** без причины. Рефакторинг = move/split, не redesign.
- **Один коммит / одна логическая пачка** по фазам ниже (или частые мелкие коммиты с понятными сообщениями).
- После каждой фазы: typecheck + быстрый ручной smoke (login → dashboard → budget → itinerary → profile).
- Не раздувай абстракции (не вводи «framework внутри framework»). Feature folders + thin hooks + pure lib.
- Не удаляй фичи. Не «упрощай» split/settlement логику — **вынеси как есть**, потом можно почистить.
- Сохрани русские строки UI.
- `.env` не коммить; секреты не печатай в чат/логи.

---

## Текущие god-файлы (обязательно разрезать)

| Файл | ~LOC | Проблема |
|------|------|----------|
| `src/components/trip/budget.tsx` | 1138 | UI + формы + долги + графики + модалки |
| `src/app/profile/page.tsx` | 912 | монолит профиля |
| `src/hooks/use-trip.ts` | 741 | ~50 хуков всех доменов |
| `src/components/trip/dashboard.tsx` | 702 | hero + прогресс + виджеты |
| `src/components/trip/quick-add.tsx` | 658 | много локального state |
| `src/components/trip/itinerary.tsx` | 655 | маршрут целиком |
| `src/components/trip/rest-chill.tsx` | 617 | толстый экран |
| `src/components/trip/food-guide.tsx` | 486 | близко к лимиту |
| `src/components/trip/trip-map.tsx` | 420 | карта + логика |
| `src/components/trip/trip-switcher.tsx` | 409 | |
| `src/components/trip/app-shell.tsx` | 368 | на грани |

Приоритет: **use-trip → budget → profile → dashboard/itinerary/quick-add/rest-chill → остальные >350**.

---

## Целевая структура папок

### 1) Хуки — по доменам

Сейчас: всё в `src/hooks/use-trip.ts`.

Сделать:

```
src/hooks/
  trip/
    trip-id.ts          # getTripId, setTripId
    use-trip.ts         # useTrip, dates, budget trip settings, members
    use-days.ts
    use-places.ts
    use-photos.ts
    use-expenses.ts
    use-journal.ts
    use-weather.ts
    use-checklist.ts
    use-info.ts
    use-currency.ts
    use-phrases.ts
    use-budget-plan.ts
    use-board.ts
    use-foods.ts
    use-nearby.ts
    use-ai-summary.ts
    index.ts            # re-export всего (чтобы старые импорты жил)
  use-auth.ts           # как есть
  use-websocket.ts
  use-push.ts
  ...
```

**Переходный слой:** оставить `src/hooks/use-trip.ts` как тонкий `export * from "./trip"` пока не обновлены все импорты — затем удалить или оставить barrel.

Типы, которые сейчас объявлены внутри `use-trip.ts` (`ChecklistItem`, `InfoItem`, `Phrase`, `FoodItem`, …) — перенести в `src/lib/types.ts` или `src/lib/types/<domain>.ts`.

### 2) UI фич — feature folders

Сейчас всё плоско в `src/components/trip/*.tsx`.

Целевой паттерн (пример для budget):

```
src/components/trip/budget/
  index.tsx                 # export { Budget } — публичная точка
  Budget.tsx                # оркестратор экрана (<350 LOC)
  BudgetHero.tsx
  ExpenseRow.tsx
  AddExpenseForm.tsx
  ParticipantBudgetRow.tsx
  BudgetEditModal.tsx
  MarkSettledButton.tsx
  CurrencySection.tsx       # если ещё смешано
```

Аналогично:

```
dashboard/          # Dashboard + skeleton + day progress + date editor pieces
itinerary/          # список дней, day card, place row, edit sheets
quick-add/          # sheet + forms по типам (expense/place/journal…)
rest-chill/         # таймер / tips / секции
food-guide/         # list + add modal + card
map/                # trip-map + helpers
profile/            # вынести из app/profile/page.tsx в components, page тонкий
app-shell/          # shell + nav + tab map (если раздуется)
```

`src/app/page.tsx` продолжает импортировать публичные экраны (`Budget`, `Dashboard`, …) — пути обновить на `@/components/trip/budget` и т.д.

### 3) Чистая бизнес-логика

Вынести из `budget.tsx`:

```
src/lib/budget/
  balances.ts       # paid / owedToMe / owedToOthers / balance per participant
  settle.ts         # settleDebts(...)
  split.ts          # perPerson при excludeSelf / splitWith
  format.ts         # мелкие хелперы отображения если есть
  index.ts
```

Компоненты только вызывают эти функции. **Не меняй формулы** при переносе — сначала copy-paste + те же тесты/сравнение на фикстурах.

### 4) API auth helper (обязательно)

Создать что-то вроде:

```
src/lib/api-auth.ts
  requireUser(req) -> User | Response(401)
  requireTripMember(req, tripId) -> { user, membership } | Response(401/403)
```

Подключить ко **всем** роутам, которые читают/меняют trip-данные (`expenses`, `days`, `places`, `photos`, `journal`, `board`, `foods`, `checklist`, `info`, `phrases`, `budget-plan`, `trip`, `trips/...`, upload и т.д.).

Сейчас многие роуты берут `tripId` из query и делают Prisma **без проверки сессии** — это дыра. Закрой.

Используй существующий кастомный JWT/session (`custom-session` / cookie `next-auth.session-token`) — не плоди третью схему auth. Если next-auth и custom уже дублируются — оставь один путь, задокументируй в комментарии 3–5 строк.

Публичные исключения (явно пометить комментарием):
- `GET /api/health`
- login/register
- возможно join preview — но join должен быть auth'd если так задумано

### 5) Убрать China / default-trip хардкоды

Пройтись grep по: `China`, `guangzhou`, `default-trip`, `China 2024`, жёсткие `CITY_EMOJI` только под Китай.

Правила замены:
- `getTripId()` не должен молча возвращать `"default-trip"` в проде UI без поездки — лучше пустой/redirect на создание/join (сохрани текущий UX flow, но не подмешивай чужие данные).
- Эмодзи городов: fallback `"📍"` / из данных дня, не только Guangzhou.
- Weather/geocode/nearby: опираться на координаты/город **текущего дня поездки**, не на Китай по умолчанию.
- Шаблоны в `trip-templates.ts` могут остаться China как один из шаблонов — это ок.

### 6) Уборка репо

Удалить или перенести в `docs/qa-screenshots/` (лучше удалить из git-рабочей копии, если не нужны):
- все `qa-*.png`, `screenshot-*.png` в корне
- `workspace-*.tar` (архив исходников — не часть проекта)

`worklog.md` → `docs/worklog.md` (опционально).

Обновить `.gitignore` если нужно: `*.tar`, `qa-*.png` в корне.

---

## Фазы выполнения (порядок важен)

### Фаза 0 — подготовка
- [ ] Зафиксировать текущее поведение: список табов из `trip-store`, smoke checklist ниже.
- [ ] Убедиться что `prisma` / `bun install` / dev server поднимаются.
- [ ] Не начинать с UI redesign.

### Фаза 1 — split hooks (`use-trip.ts`)
- [ ] Создать `src/hooks/trip/*` по доменам как в структуре выше.
- [ ] Перенести типы в `lib/types`.
- [ ] `src/hooks/use-trip.ts` → re-export.
- [ ] Прогнать typecheck; поправить импорты если barrel не хватает.
- [ ] Smoke: данные на dashboard/budget/gallery грузятся.

### Фаза 2 — lib budget + split `budget.tsx`
- [ ] Вынести `settleDebts` / balance math в `src/lib/budget/*` **без изменения логики**.
- [ ] Разрезать UI на `components/trip/budget/*`.
- [ ] Публичный `Budget` через `index.tsx`.
- [ ] Smoke: добавить трату, split, settlement, графики, редактирование бюджета поездки.

### Фаза 3 — profile / dashboard / itinerary / quick-add / rest-chill
- [ ] `profile/page.tsx` → тонкая page + `components/trip/profile/*`.
- [ ] `dashboard/` split (hero, stats, upcoming, date settings).
- [ ] `itinerary/`, `quick-add/`, `rest-chill/` по тому же принципу.
- [ ] Каждый файл ≤ ~350 LOC.

### Фаза 4 — API auth
- [ ] `requireUser` / `requireTripMember`.
- [ ] Подключить ко всем trip-scoped route handlers.
- [ ] Убедиться что фронт уже шлёт cookies (same-origin fetch) — если 401, чинить клиент, не отключать auth.
- [ ] Удалить или защитить `test-auth` в проде.

### Фаза 5 — de-China + defaults
- [ ] Grep + замены хардкодов.
- [ ] Проверить AI summary / weather / map на не-китайской поездке (или шаблоне).

### Фаза 6 — cleanup
- [ ] Убрать QA png / tar из корня.
- [ ] Проверить что нет мёртвых импортов.
- [ ] Финальный `build` + lint.

---

## Smoke checklist (после каждой крупной фазы)

1. Login / register (глазик пароля, confirm).
2. Список поездок / switcher / создать / join по коду.
3. Dashboard: день, прогресс, погода.
4. Itinerary: день, место, статус.
5. Quick-add: expense / place.
6. Budget: add, split, balances, settle, currency, budget plan.
7. Gallery / journal / board / food / phrases / info / checklist.
8. Profile: аватар, настройки, push toggle.
9. Realtime: действие на одном клиенте видно на другом (если WS поднят).
10. Mobile ширина ~390px: модалки/bottom sheets не ломают скролл.

---

## Чего НЕ делать

- Не переписывать на другой стейт-менеджер.
- Не мигрировать SQLite → Postgres в этом брифе (можно позже).
- Не внедрять App Router page-per-tab обязательно (Zustand tabs ок); routing refactor — отдельная задача.
- Не трогать дизайн-токены / «сделать красивее», кроме случая когда split сломал layout.
- Не генерировать огромные комментарии и README ради README.
- Не оставлять файлы «Part1/Part2» без смысла — имена по ответственности.

---

## Критерии приёмки (коротко)

- [ ] `use-trip.ts` либо отсутствует, либо ≤30 строк barrel.
- [ ] `budget/` — папка, нет файла 1000+ LOC.
- [ ] `profile/page.tsx` ≤ ~150 LOC (оркестрация).
- [ ] Все файлы фич ≤ 400 LOC (цель 250).
- [ ] API мутации с auth+membership.
- [ ] Grep `default-trip` / голый China-default в runtime UI — чисто или только в seeds/templates.
- [ ] Build зелёный, smoke checklist ок.

---

## Подсказки по текущему коду

- Главный SPA: `src/app/page.tsx` + `useTripStore().activeTab`.
- Хуки: `src/hooks/use-trip.ts` (~50 export function).
- Budget helpers сейчас внутри файла: `settleDebts`, логика split около строк с `excludeSelf` / `splitWith`.
- Auth: `src/lib/auth.ts` + `src/app/api/auth/custom-*` (JWT cookie).
- Emit realtime: `src/lib/ws-emit.ts` + `server/*`.
- Типы/константы: `src/lib/types.ts`, шаблоны: `src/lib/trip-templates.ts`.

Начни с **Фазы 1**, потом **Фаза 2**. После каждой фазы кратко отчитайся: что разрезали, какие файлы появились, что проверили.
