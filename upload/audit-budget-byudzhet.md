# TripTrek — бриф: Бюджет (Budget)

> Для ИИ-агента: **только Бюджет** (+ shared hooks/API expenses). Mobile-first. Несколько участников, долги/split должны сходиться. Не ломать формулы «на глаз» — сначала фикстуры 2–3 юзеров. Русский UI.

**Файлы:**
- UI god: `src/components/trip/budget.tsx` (~1200+ LOC)
- План: `src/components/trip/budget-plan-widget.tsx`
- Конвертер: `src/components/trip/currency-converter.tsx`
- Дубль формы: `src/components/trip/quick-add.tsx` (тот же `useAddExpense`)
- Хуки: `useExpenses`, `useAddExpense`, `useDeleteExpense`, `useBudgetPlan`, `useUpdateBudgetPlan`, `useCurrency`, `useUpdateTripBudget`, `useUpdateMember` — `src/hooks/use-trip.ts`
- API: `expenses/route.ts`, `budget-plan/route.ts`, `trip/budget/route.ts`, `currency/route.ts`, `trips/[tripId]/members/[memberId]/route.ts`, `trip/route.ts` (totals)
- Types: `src/lib/types.ts` (`EXPENSE_CATEGORIES` — **нет** явного `settlement`)
- Schema: `prisma/schema.prisma` (`splitWith`, `excludeSelf`)
- WS: `use-websocket.ts` (`expense:*`, `budget:updated`, `trip:updated`)

**Смысл:** общие/личные траты, балансы «кто кому должен», settlement, план бюджета, валюты — для компании в поездке.

---

## Как работает split/settlement сейчас (не ломать без фикстуры)

1. **Личная:** в «За кого?» только плательщик → `splitWith=[]`, долгов нет.
2. **Общая:** `splitWith` = остальные; `excludeSelf = !split.includes(payer)`.
3. **Доля:** `excludeSelf ? amount/n : amount/(n+1)`.
4. **Balance:** `owedToMe - owedToOthers` (settlement **входит** в долги — так компенсируют).
5. **Paid:** settlement **исключён** из «сколько заплатил».
6. **«Перевели»:** `paidBy=должник`, `splitWith=[кредитор]`, `excludeSelf=true` → reverse debt.
7. Кнопка settlement на клиенте только у **кредитора**.

Функция `settleDebts` в `budget.tsx` **мертва**; UI считает **pairwise net**, не greedy.

---

## P0 — сразу

### 1. API без auth/membership
- expenses GET/POST/DELETE, budget-plan, trip/budget, members PATCH.
- **Нужно:** сессия + member trip; 401/403.

### 2. `useAddExpense` без `!r.ok` → toast-ложь
- `mutateAsync` не кидает на 400; UI всегда success.
- **Где:** `use-trip.ts`; call sites: `AddExpenseForm`, `MarkSettledButton`, `quick-add.tsx`.
- **Нужно:** throw на `!ok`; try/catch; не закрывать форму при ошибке. То же `useDeleteExpense`.

### 3. Race: двойной settlement
- Два клика / два клиента → двойной reverse → баланс ломается.
- **Нужно:** идемпотентность на сервере + disable до refetch; лучше отдельная модель/ключ, не «ещё один split-expense» без guard.

### 4. Нет trip / ошибка → вечный «Загрузка…»
- `isLoading || !expenses || !trip`; `useTrip` disabled без id; expenses без enabled → non-array краш.
- **Нужно:** empty/error; `enabled: !!tripId`; всегда массив.

---

## P1 — целостность / UX-обман

### 5. Settlement в «потратил» участника и в plan totals
- Hero/charts **исключают** settlement; `ParticipantBudgetRow` / `BudgetPlanWidget` / `api/trip` totalSpent — **включают**.
- **Нужно:** единый `isRealExpense` / `category !== "settlement"` везде.

### 6. `BudgetEditModal` — нет invalidate после save
- Raw fetch members; toast; без `invalidateQueries(["trip"])`.
- Зависит от WS (может молча не дойти).
- **Нужно:** invalidate + `r.ok` на каждый PATCH.

### 7. Toast success сразу после `mutate` (не async)
- `ParticipantBudgetRow`, `BudgetHero` — toast до ответа.
- **Нужно:** только `onSuccess` / `onError`.

### 8. GET expenses без `day` include
- UI «День N» пустой.
- **Где:** `api/expenses` GET; `ExpenseRow`.

### 9. Currency: везде `$`; fallback API урезан vs UI-список → convert = 0
- **Где:** `currency/route.ts` catch; `currency-converter.tsx`; AddExpenseForm CURRENCIES.
- **Нужно:** полный fallback; badge курсов; показывать валюту поездки.

### 10. MarkSettled без сессии → кнопка null
- Нельзя подтвердить перевод.
- **Нужно:** CTA «войти» / fallback id; сервер всё равно auth.

### 11. Copy hint про «ноль одним набором» врёт для 3+
- Pairwise ≠ минимальный settlement (`settleDebts` мёртв).
- **Нужно:** либо greedy, либо честный copy «по парам».

### 12. Округление: список `toFixed(0)`, детали `toFixed(2)`
### 13. `PATCH /api/trip/budget` без `emitWS`
- Другие клиенты не узнают.
### 14. POST expense: нет проверки paidBy/split ∈ members; settlement с клиента без ограничений

---

## P2 — polish

### 15. Разбить god-файл `budget.tsx` (balances utils, forms, modals)
### 16. Удалить или использовать мёртвый `settleDebts`
### 17. Empty history «нет трат» + CTA
### 18. Счётчики real vs settlement раздельно
### 19. Mobile: tap ≥44px, sticky submit, `inputMode`
### 20. Converter: дата `updated`; disable при missing rate
### 21. Один source of truth: hero totalBudget vs сумма участников (`api/trip` calculatedBudget)
### 22. Double-submit onBlur+Enter на edit полей
### 23. Plan widget: явно фильтровать settlement

---

## Definition of Done

- [ ] API: auth + membership; нет тихого успеха
- [ ] Add/Delete expense: throw на fail; error toast
- [ ] Settlement: нельзя задвоить; после 1× пара = 0
- [ ] Empty/error trip; expenses всегда массив
- [ ] Единый фильтр settlement для spent/plan/trip/hero
- [ ] После edit budgets: invalidate trip (+ WS)
- [ ] GET expenses с day; история показывает день
- [ ] Currency: fallback покрывает UI; нет silent $0
- [ ] MarkSettled для залогиненного кредитора
- [ ] Hints = фактический алгоритм
- [ ] Mobile форма 375px; регресс 2–3 юзера + quick-add совпадает с Budget

## Ручной регресс

1. Нет tripId → empty, не hang.  
2. Add 400 → error toast, форма открыта.  
3. A платит за B $100 → балансы; «Перевели» 1× → 0.  
4. «Перевели» 2× быстро → не −200.  
5. Личная трата → балансы без изменений.  
6. Edit member budgets → UI без reload.  
7. Конвертер offline → warning, не silent 0.

## Чего не делать

- Не toast.success сразу после mutate без ответа.
- Не чинить долги ещё одним settlement без идемпотентности.
- Не считать settlement в personal/plan/trip totalSpent.
- Не только UI-auth без сервера.
- Не удалять pairwise/greedy, не сверив 3-person fixture.
- Не раздувать `budget.tsx` — выносить логику.
- Не коммитить без просьбы.
