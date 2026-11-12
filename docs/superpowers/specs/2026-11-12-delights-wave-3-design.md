# Волна 3 «Тихая полировка» — дизайн

Дата: 2026-11-12 · Статус: утверждена (обсуждение в чате, карта delights 2026-11-12)
Четыре маленьких улучшения накопительного «ощущения качества». Ни схемы, ни API —
только клиент на существующих эндпоинтах и паттернах.

## 1. Undo на удаления траты и места

Фото без undo — файл удаляется физически, честного возврата нет (вне скоупа).

Паттерн уже есть в кодовой базе: дневник (`journal.tsx:609`, «Запись удалена» с
действием) и блюда (`FoodSheet.tsx:200`). Задача — распространить его на:

- **Трату** (`useDeleteExpense`, `src/hooks/trip/use-expenses.ts:98`): optimistic
  `onMutate` уже сохраняет предыдущий список в `ctx.prev` — удалённая трата берётся
  оттуда. После успешного DELETE → toast «Трата удалена» с действием «Вернуть»
  (duration ~8000). «Вернуть» → `POST /api/expenses` с пересобранным payload.
  Существующий тост «Удалено» в `ExpenseRow.tsx:75` заменяется этим.
- **Место** (`useDeletePlace`, `src/hooks/trip/use-places.ts:51`): хук пока не
  снимает снапшот — добавить `onMutate` с `cancelQueries` по route-ключу
  (`routeKey(tripId)` из `src/lib/query-keys.ts`) и поиском места в кэше. После
  успеха → toast «Место удалено» с действием «Вернуть» и описанием «фото места
  не привяжутся обратно» (Photo.placeId → SetNull, `prisma/schema.prisma:364`).
  «Вернуть» → `POST /api/places` (контракт: `pickPatchablePlace`, обязательны
  name/dayId/tripId/lat/lng — `src/app/api/places/route.ts:15`).

Пересборка payload — чистые функции с тестами:
- `src/lib/budget/expense-undo.ts`: `expenseRestorePayload(removed: Expense)` —
  DTO → POST-тело: `splitWith` строка → массив, отбросить `id/paidBy/day/createdAt`,
  сохранить `originalAmount/originalCurrency/excludeSelf/settlementKey`.
- `src/lib/place-undo.ts`: `placeRestorePayload(place: Place)` — только поля из
  `PLACE_PATCHABLE` + `tripId` (последний берётся из route-кэша на месте вызова).

Ошибки recreate → `toast.error("Не удалось вернуть")` — оптимистичный мир
уже обновился, пользователь видит честный сбой.

## 2. AnimatedNumber в Обзоре

`src/components/trip/dashboard/DashboardStats.tsx`: бюджет `trip.totalSpent`
(строка ~42) и числовые значения `StatCard` (посещённые места, фото) доезжают
до значения через существующий `AnimatedNumber` (reduced-motion уже уважается
компонентом). Форматы сохраняются: `${sym}${…}` без дробей; счётчики — целые.

## 3. EmptyState с характером — бюджет

Единый примитив `EmptyState { emoji, title, hint?, cta?: { label, onClick } }`
(новый `src/components/trip/empty-state.tsx`, мягкая карточка `bg-muted/40`,
центрирование — тон существующего копирайтинга). Применить к пустым состояниям
бюджета: `BudgetPlanTab.tsx:139` («Твоих трат пока нет» → тёплая строка + CTA
«Записать трату», открывает быстрое добавление) и три варианта
`ExpenseHistory.tsx:17-19`. Существующие EmptyHero (карта/маршрут) и анимированная
пустая галерея не трогаются. Дневник/чат — вне скоупа этого захода (их пустые
состояния не нашлись простым grep; вернуться при следующей волне).

## 4. Скелетоны вместо длинных спиннеров

Критерий: спиннер держит ЦЕЛУЮ секцию/вкладку дольше пары секунд → скелетон по
паттерну `ui/skeleton.tsx` (готовые DashboardSkeleton/BudgetSkeleton как образцы).
Кнопочные `Loader2` остаются. Конкретные точки — по факту grep `animate-spin` в
загрузочных ветках компонентов; цель — 4–6 самых заметных замен, не тотальная
зачистка.

## Границы

- Ни схемы, ни API, ни новых зависимостей.
- Коммит на каждый пункт; тесты для чистых функций п.1 (`expense-undo.test.ts`,
  `place-undo.test.ts`, vitest node-env, рядом с модулем).
- lint 0 ошибок; tsc чист; полный suite зелёный.

## Документация (тем же коммитом, что последний пункт)

- `AGENTS.md`: новый lib-модуль `expense-undo.ts`/`place-undo.ts` в карту,
  `empty-state.tsx` упоминанием в компонентах.
- `worklog.md`: запись сессии.
