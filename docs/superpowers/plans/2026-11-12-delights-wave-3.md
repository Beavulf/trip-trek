# Волна 3 «Тихая полировка» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Накопительное ощущение качества: undo на удаления траты/места, оживающие цифры Обзора, EmptyState с характером в бюджете, скелетоны вместо длинных спиннеров.

**Architecture:** Только клиент. Undo — распространение существующего паттерна (журнал `journal.tsx:609`, блюда `FoodSheet.tsx:200`) на траты и места: удалённый объект берётся из optimistic-снапшота мутации, «Вернуть» пересоздаёт через штатный POST; пересборка payload — чистые функции с тестами. AnimatedNumber и EmptyState — переиспользование/создание примитивов.

**Tech Stack:** framer-motion уже есть; sonner (тосты с action, duration 8000); TanStack Query снапшоты; vitest node-env.

Спека: `docs/superpowers/specs/2026-11-12-delights-wave-3-design.md`

## Global Constraints

- Комментарии в коде — по-русски, «почему», не «что».
- Ноль новых зависимостей; ни схемы, ни API.
- Undo-действие защищено от двойного POST (sonner не дисейблит action) — паттерн `restoringRef` из `journal.tsx:612-615`.
- Тесты vitest node-env рядом с модулем; lint 0 ошибок; tsc чист; suite зелёный.
- UI по-русски; суммы trip-бюджета — USD в `amount`, отображение — `trip.settings.currency`; `splitWith` в DTO — строка через запятую, в POST-контракте — массив.

---

### Task 1: Undo удаления траты

**Files:**
- Create: `src/lib/budget/expense-undo.ts`
- Test: `src/lib/budget/expense-undo.test.ts`
- Modify: `src/hooks/trip/use-expenses.ts:98-124` (`useDeleteExpense`)
- Modify: `src/components/trip/budget/ExpenseRow.tsx:73-83` (`handleDelete`)

**Interfaces:**
- Consumes: `Expense` из `@/lib/types` (поля: `splitWith?: string`, `dayId: string | null`, `originalAmount/originalCurrency?: string | null`); POST /api/expenses контракт (`src/app/api/expenses/route.ts:40`, нормализация `src/lib/budget/expense-input.ts` — splitWith массивом, settlement требует `excludeSelf: true` + `settlementKey` с префиксом `settle-`).
- Produces: `expenseRestorePayload(removed: Expense, tripId: string, keySuffix: string): ExpenseRestorePayload` — чистая функция; undo-тост централизован в `useDeleteExpense` (все три вызывающих — `ExpenseRow`, `split/expense-sheet.tsx`, `split/expense-detail-sheet.tsx` — получают его бесплатно).

- [x] **Step 1: Написать падающий тест**

`src/lib/budget/expense-undo.test.ts` (стиль — как `src/lib/celebrations.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { expenseRestorePayload } from "./expense-undo";
import type { Expense } from "@/lib/types";

const base = {
  id: "e1",
  amount: 12.5,
  category: "food",
  description: "Ужин",
  paidById: "u1",
  paidBy: { id: "u1", name: "Ты", emoji: "🦊", color: "#f97316" } as Expense["paidBy"],
  dayId: "d1",
  day: null,
  createdAt: "2026-11-12T10:00:00.000Z",
} as Expense;

describe("expenseRestorePayload", () => {
  it("DTO → POST-тело: splitWith строка → массив, служебные поля отброшены", () => {
    const p = expenseRestorePayload({ ...base, splitWith: "u1,u2", excludeSelf: false }, "trip1", "abc");
    expect(p).toEqual({
      tripId: "trip1",
      amount: 12.5,
      category: "food",
      description: "Ужин",
      paidById: "u1",
      dayId: "d1",
      splitWith: ["u1", "u2"],
      excludeSelf: false,
      originalAmount: undefined,
      originalCurrency: undefined,
      settlementKey: undefined,
    });
  });

  it("пустой splitWith → пустой массив (личная трата)", () => {
    const p = expenseRestorePayload(base, "trip1", "abc");
    expect(p.splitWith).toEqual([]);
  });

  it("для перевода добавляется settlementKey с префиксом settle-undo-", () => {
    const p = expenseRestorePayload({ ...base, category: "settlement", excludeSelf: true }, "trip1", "abc");
    expect(p.settlementKey).toBe("settle-undo-abc");
    expect(p.excludeSelf).toBe(true);
  });

  it("null dayId → undefined (не null: контракт POST ждёт отсутствие)", () => {
    const p = expenseRestorePayload({ ...base, dayId: null }, "trip1", "abc");
    expect(p.dayId).toBeUndefined();
  });

  it("originalAmount/originalCurrency сохраняются", () => {
    const p = expenseRestorePayload({ ...base, originalAmount: 100, originalCurrency: "CNY" }, "trip1", "abc");
    expect(p.originalAmount).toBe(100);
    expect(p.originalCurrency).toBe("CNY");
  });
});
```

- [x] **Step 2: Запустить — падает** (`bunx vitest run src/lib/budget/expense-undo.test.ts` → FAIL, модуля нет)

- [x] **Step 3: Реализация**

`src/lib/budget/expense-undo.ts`:

```ts
// Undo удаления траты: пересборка POST-полезной нагрузки из DTO кэша.
// DTO хранит splitWith строкой («u1,u2»), POST ждёт массив; служебные поля
// (id/paidBy/day/createdAt) в восстановление не идут. Переводу нужен
// settlementKey с префиксом settle- (expense-input.ts:96) — генерируем новый:
// старая запись удалена, ключ свободен, а свежий суффикс защищает от коллизий.
import type { Expense } from "@/lib/types";

export interface ExpenseRestorePayload {
  tripId: string;
  amount: number;
  category: string;
  description: string;
  paidById: string;
  dayId?: string;
  splitWith: string[];
  excludeSelf?: boolean;
  originalAmount?: number;
  originalCurrency?: string;
  settlementKey?: string;
}

export function expenseRestorePayload(removed: Expense, tripId: string, keySuffix: string): ExpenseRestorePayload {
  return {
    tripId,
    amount: removed.amount,
    category: removed.category,
    description: removed.description,
    paidById: removed.paidById,
    dayId: removed.dayId ?? undefined,
    splitWith: (removed.splitWith ?? "").split(",").filter(Boolean),
    excludeSelf: removed.excludeSelf,
    originalAmount: removed.originalAmount ?? undefined,
    originalCurrency: removed.originalCurrency ?? undefined,
    settlementKey: removed.category === "settlement" ? `settle-undo-${keySuffix}` : undefined,
  };
}
```

- [x] **Step 4: Тест зелёный** (`bunx vitest run src/lib/budget/expense-undo.test.ts` → PASS)

- [x] **Step 5: Встроить undo в useDeleteExpense**

`src/hooks/trip/use-expenses.ts`, `useDeleteExpense` — добавить `onSuccess` (после существующего `onError`/`onSettled` порядок не важен, но до `onSettled` логичнее) и импорт `getTripId` (уже в файле) + `expenseRestorePayload` + `toast` (проверить импорты файла):

```ts
    onSuccess: (_res, id, ctx) => {
      const removed = ctx?.prev?.find((e) => e.id === id);
      if (!removed) return;
      // sonner не дисейблит action — защита от двойного POST (как в journal.tsx)
      let restoring = false;
      toast.success("Трата удалена", {
        description: "Можно вернуть, пока не закрылся тост",
        duration: 8000,
        action: {
          label: "Вернуть",
          onClick: () => {
            if (restoring) return;
            restoring = true;
            const payload = expenseRestorePayload(removed, getTripId(), `${Date.now()}`);
            fetch("/api/expenses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Ошибка ${r.status}`);
                toast.success("Трата возвращена");
              })
              .catch((e) => toast.error("Не удалось вернуть", { description: e instanceof Error ? e.message : undefined }))
              .finally(() => {
                qc.invalidateQueries({ queryKey: ["expenses"] });
                qc.invalidateQueries({ queryKey: ["trip"] });
              });
          },
        },
      });
    },
```

- [x] **Step 6: Убрать дублирующий тост в ExpenseRow**

`ExpenseRow.tsx:73-83` — в `handleDelete` удалить строку `toast.success("Удалено");` (undo-тост теперь приходит из хука всем вызывающим); `setConfirming(false)` и обработка ошибки остаются. Если `toast` используется в файле ещё где-то — импорт остаётся, иначе убрать.

- [x] **Step 7: Верификация** — `bun run lint` (0 ошибок), `bunx tsc --noEmit` (чисто), `bun run test` (suite зелёный)

- [x] **Step 8: Коммит**

```bash
git add src/lib/budget/expense-undo.ts src/lib/budget/expense-undo.test.ts src/hooks/trip/use-expenses.ts src/components/trip/budget/ExpenseRow.tsx
git commit -m "feat: undo удаления траты — «Вернуть» из optimistic-снапшота"
```

---

### Task 2: Undo удаления места

**Files:**
- Create: `src/lib/place-undo.ts`
- Test: `src/lib/place-undo.test.ts`
- Modify: `src/hooks/trip/use-places.ts:51-63` (`useDeletePlace`)

**Interfaces:**
- Consumes: `PLACE_PATCHABLE` из `@/lib/place-fields` (список полей Place, тип только — node-env безопасно); `queryKeys.route(tripId)` из `@/lib/query-keys`; read-модель маршрута (проверить форму: `src/lib/route.ts` — дни с массивами мест; место ищется по `id` во всех днях).
- Produces: `placeRestorePayload(place: Place): Record<string, unknown>` — только поля `PLACE_PATCHABLE`, присутствующие в объекте.

- [x] **Step 1: Падающий тест** `src/lib/place-undo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placeRestorePayload } from "./place-undo";

const place = {
  id: "p1",
  name: "Canton Tower",
  description: "Телебашня",
  category: "sight",
  lat: 23.1066,
  lng: 113.3245,
  timeOfDay: "evening",
  budget: 20,
  address: "Yuejiang W Rd",
  notes: "",
  rating: null,
  status: "planned",
  visitedAt: null,
  dayId: "d2",
  tripId: "t1",
} as any;

describe("placeRestorePayload", () => {
  it("только поля PLACE_PATCHABLE, присутствующие в объекте", () => {
    const p = placeRestorePayload(place);
    expect(p).toEqual({
      name: "Canton Tower",
      description: "Телебашня",
      category: "sight",
      lat: 23.1066,
      lng: 113.3245,
      timeOfDay: "evening",
      budget: 20,
      address: "Yuejiang W Rd",
      notes: "",
      rating: null,
      status: "planned",
      visitedAt: null,
      dayId: "d2",
    });
  });

  it("лишние поля (id/tripId/прочее) не попадают", () => {
    const p = placeRestorePayload({ ...place, id: "p1", tripId: "t1", photos: [] });
    expect(p).not.toHaveProperty("id");
    expect(p).not.toHaveProperty("tripId");
    expect(p).not.toHaveProperty("photos");
  });
});
```

- [x] **Step 2: Падает** (`bunx vitest run src/lib/place-undo.test.ts`)

- [x] **Step 3: Реализация** `src/lib/place-undo.ts`:

```ts
// Undo удаления места: из read-модели маршрута собираем POST-нагрузку строго
// из PLACE_PATCHABLE — POST /api/places валидирует вход тем же списком
// (pickPatchablePlace), так что чужие поля не только бесполезны, но и risky.
import { PLACE_PATCHABLE, type PlacePatch } from "./place-fields";

type PlaceLike = Record<string, unknown>;

export function placeRestorePayload(place: PlaceLike): PlacePatch {
  const out: Record<string, unknown> = {};
  for (const k of PLACE_PATCHABLE) {
    if (k in place) out[k] = place[k];
  }
  return out as PlacePatch;
}
```

- [x] **Step 4: Зелёный**

- [x] **Step 5: Встроить в useDeletePlace** (`src/hooks/trip/use-places.ts`) — хук получает `getTripId` (есть в файле? проверить; если нет — импорт из того же места, откуда берут остальные хуки файла) и `queryKeys`:

```ts
export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/places/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "delete place failed");
      }
    },
    // Снапшот read-модели маршрута: из неё собирается payload восстановления
    onMutate: async (id) => {
      const key = queryKeys.route(getTripId());
      await qc.cancelQueries({ queryKey: key });
      const data = qc.getQueryData<{ days: { places: PlaceLike[] }[] }>(key);
      const removed = data?.days.flatMap((d) => d.places).find((p) => p.id === id) ?? null;
      return { removed };
    },
    onSuccess: (_res, _id, ctx) => {
      invalidateRouteData(qc);
      if (!ctx?.removed) return;
      let restoring = false;
      toast.success("Место удалено", {
        description: "Фото места не привяжутся обратно",
        duration: 8000,
        action: {
          label: "Вернуть",
          onClick: () => {
            if (restoring) return;
            restoring = true;
            fetch("/api/places", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...placeRestorePayload(ctx.removed), tripId: getTripId() }),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Ошибка ${r.status}`);
                toast.success("Место возвращено");
              })
              .catch((e) => toast.error("Не удалось вернуть", { description: e instanceof Error ? e.message : undefined }))
              .finally(() => invalidateRouteData(qc));
          },
        },
      });
    },
  });
}
```

ПРИМЕЧАНИЯ ИСПОЛНИТЕЛЮ: (а) форму read-модели (`days[].places`) сверь с `src/lib/route.ts` — если поле называется иначе (например, `placesByDay`), скорректируй flatMap по факту; (б) `onError` у мутации НЕТ — добавь `onError: () => invalidateRouteData(qc)` чтобы оптимистичный мир вернулся при неудаче? — НЕТ: сейчас хук не оптимистичен (место исчезает после рефетча) — снапшот в onMutate только для undo, откат не нужен; (в) тип `PlaceLike` — локальный, не экспортируй.

- [x] **Step 6: Верификация** — lint / tsc / suite

- [x] **Step 7: Коммит**

```bash
git add src/lib/place-undo.ts src/lib/place-undo.test.ts src/hooks/trip/use-places.ts
git commit -m "feat: undo удаления места — восстановление из снапшота маршрута"
```

---

### Task 3: AnimatedNumber в Обзоре

**Files:**
- Modify: `src/components/trip/dashboard/DashboardStats.tsx:42,73-95`

**Interfaces:**
- Consumes: `AnimatedNumber({ value, format })` из `../budget/AnimatedNumber`.
- Produces: ничего.

- [x] **Step 1: Правки**

Импорт: `import { AnimatedNumber } from "../budget/AnimatedNumber";`

Бюджет (~строка 42) — заменить:

```tsx
<span className="text-3xl font-bold leading-none tabular-nums">{sym}{trip.totalSpent.toFixed(0)}</span>
```

на:

```tsx
{/* Сумма «доезжает» до значения — трата не прыгает при загрузке Обзора */}
<AnimatedNumber value={trip.totalSpent} format={(v) => `${sym}${Math.round(v)}`} className="text-3xl font-bold leading-none tabular-nums" />
```

ВНИМАНИЕ: `AnimatedNumber` сейчас не принимает `className` (возвращает только текст). Не менять его API ради этого — обернуть:

```tsx
<span className="text-3xl font-bold leading-none tabular-nums">
  <AnimatedNumber value={trip.totalSpent} format={(v) => `${sym}${Math.round(v)}`} />
</span>
```

StatCard: числовые вызовы (места ~:73, фото ~:79) — обернуть значение:

```tsx
<StatCard
  icon={<MapPin className="size-5" />}
  value={<AnimatedNumber value={trip.visitedPlaces} format={(v) => String(Math.round(v))} />}
  label={`из ${trip.totalPlaces} мест`}
  ...
/>
<StatCard
  icon={<Camera className="size-5" />}
  value={<AnimatedNumber value={trip.totalPhotos} format={(v) => String(Math.round(v))} />}
  label="Фото"
  ...
/>
```

«Рядом» (строка) не трогается.

- [x] **Step 2: Верификация** — lint / tsc / suite
- [x] **Step 3: Коммит**

```bash
git add src/components/trip/dashboard/DashboardStats.tsx
git commit -m "feat: цифры Обзора доезжают до значения (AnimatedNumber)"
```

---

### Task 4: EmptyState в бюджете

**Files:**
- Create: `src/components/trip/empty-state.tsx`
- Modify: `src/components/trip/budget/BudgetPlanTab.tsx:137-145`
- Modify: `src/components/trip/budget/ExpenseHistory.tsx` (EMPTY_TEXT + рендер пустой ветки)

**Interfaces:**
- Consumes: ничего (кроме cn).
- Produces:

```ts
export function EmptyState(props: {
  emoji: string;
  title: string;
  hint?: string;
  cta?: { label: string; onClick: () => void };
}): JSX.Element
```

- [x] **Step 1: Примитив** `src/components/trip/empty-state.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

// Единый пустой состояние-карточка с характером: мягкий фон, эмодзи, тёплая
// строка и опциональное действие. Для больших «героев» (карта/маршрут) есть
// EmptyHero; этот — для списков и вкладок.
export function EmptyState({ emoji, title, hint, cta, className }: {
  emoji: string;
  title: string;
  hint?: string;
  cta?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-muted/40 px-4 py-8 text-center", className)}>
      <div className="text-4xl" aria-hidden>{emoji}</div>
      <p className="mt-2 text-sm font-medium text-pretty">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground text-pretty">{hint}</p>}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-input bg-background px-4 text-xs font-medium transition-transform active:scale-[0.98]"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
```

- [x] **Step 2: BudgetPlanTab** — ветку `rows.length === 0` (`:137-145`) заменить на EmptyState (тексты сохранить смысл, оживить тон; CTA — на существующий в компоненте способ открыть быстрое добавление: проверить props компонента; если ready-канала нет — CTA опустить, только текст):

```tsx
{rows.length === 0 ? (
  isPersonal ? (
    <EmptyState
      emoji={scope === "me" ? "💸" : "🔍"}
      title={scope === "me" ? "Твоих трат пока нет" : `У ${scopeName ?? "участника"} пока нет трат`}
      hint="Запишите первую — бюджет оживёт, а долги посчитаются сами"
      cta={scope === "me" && onQuickAdd ? { label: "Записать трату", onClick: onQuickAdd } : undefined}
    />
  ) : (
    <EmptyState
      emoji="📊"
      title="План появится с первой тратой"
      hint="Здесь будут категории, бублик и план на поездку"
    />
  )
) : (
```

ПРИМЕЧАНИЕ: `onQuickAdd` — если у BudgetPlanTab нет такого пропа, НЕ добавлять новый проп через полкомпонента: вместо CTA использовать хук `useTripStore` (в файле проверить наличие `openBudget`/`setActiveTab`) или опустить CTA. Решение принять по факту и описать в отчёте.

- [x] **Step 3: ExpenseHistory** — `EMPTY_TEXT` дополнить эмодзи, пустую ветку рендера заменить на EmptyState (найти, где сейчас рендерится `EMPTY_TEXT[filter]`):

```tsx
const EMPTY: Record<HistoryFilter, { emoji: string; text: string }> = {
  mine: { emoji: "💸", text: "Здесь появятся траты, которые оплатишь ты" },
  shared: { emoji: "🤝", text: "Общих трат пока нет" },
  personal: { emoji: "🙈", text: "Личных трат пока нет" },
  settlements: { emoji: "🔁", text: "Переводов пока нет" },
  all: { emoji: "🧾", text: "Пока нет трат" },
};
```

CTA: если у компонента есть `onAdd` и зритель — показать «Записать трату» только на фильтре `all` (`onAdd && filter === "all"`).

- [x] **Step 4: Верификация** — lint / tsc / suite
- [x] **Step 5: Коммит**

```bash
git add src/components/trip/empty-state.tsx src/components/trip/budget/BudgetPlanTab.tsx src/components/trip/budget/ExpenseHistory.tsx
git commit -m "feat: EmptyState с характером в бюджете (план + история трат)"
```

---

### Task 5: Скелетоны вместо длинных спиннеров + доки

**Files:**
- Modify: 4–6 файлов по критерию ниже
- Modify: `AGENTS.md`, `worklog.md`

**Interfaces:** Consumes: `Skeleton` из `@/components/ui/skeleton` (проверить путь импорта по готовым примерам `DashboardSkeleton`). Produces: ничего.

- [x] **Step 1: Выбрать точки по критерию**

Критерий: `animate-spin`/`Loader2` держит ЦЕЛУЮ секцию/вкладку (загрузочная ветка компонента, минимум экрана на пару секунд) → заменить на строки `<Skeleton className="h-4 w-full" />` и блоки `h-20`, по образцу `DashboardSkeleton`. Кандидаты из grep (`rg -l "animate-spin" src/components/trip --glob '*.tsx'`): `weather-panel.tsx`, `ai-summary.tsx`, `phrasebook.tsx`, `budget/RoutePlanCard.tsx`, `map-picker.tsx` — проверить каждый и заменить только секционные загрузки. Кнопочные и инлайн-спиннеры (внутри кнопки/строки) НЕ трогать. Если по факту секционных меньше 4 — заменить сколько есть и честно написать в отчёте; не выдумывать.

- [x] **Step 2: Верификация** — lint / tsc / suite
- [x] **Step 3: Доки**

`AGENTS.md`, строка `src/lib/` карты: дописать `, ` + `` `expense-undo.ts` (undo трат: DTO→POST payload; тесты рядом) `` и `` `place-undo.ts` (undo мест: PLACE_PATCHABLE→POST; тесты рядом) ``. В строку `src/components/trip/` дописать `empty-state.tsx` упоминанием (формат ячейки соблюсти).

`worklog.md`: запись в начало журнала по образцу (дата, «Сделано» по 4 пунктам, «Почему»: волна 3 карты delights — накопительное качество; ссылки на спеку/план).

- [x] **Step 4: Коммит**

```bash
git add -A src/components/trip AGENTS.md worklog.md
git commit -m "feat: скелетоны вместо секционных спиннеров; docs: карта репозитория и worklog"
```

---

## Self-review плана

1. **Покрытие спеки:** §1 → Tasks 1-2; §2 → Task 3; §3 → Task 4; §4 → Task 5; доки → Task 5. Гэпов нет.
2. **Плейсхолдеры:** два осознанных «решить по факту» (shape read-модели в Task 2; источник CTA в BudgetPlanTab) — это делегированные проверки с точными инструкциями, не TBD.
3. **Типы:** `expenseRestorePayload(removed, tripId, keySuffix)` согласован между тестом и реализацией; `placeRestorePayload(place)` аналогично; `AnimatedNumber` API не расширяется (обёртка span).
