# Мультивыбор фото в галерее — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На вкладке «Галерея» — выбор пачки кадров (долгий тап + кнопка «Выбрать») и групповые действия: избранное, скрытие от гостей, удаление (с честными правами).

**Architecture:** Новое состояние `selectMode`/`selected` в `gallery.tsx`; плиткам (`gallery-tile.tsx`) добавляются пропы выбора и хук долгого нажатия (`use-long-press.ts`); пачка исполняется существующими PATCH/DELETE через чистый раннер `src/lib/photo-bulk.ts` (лимит параллельности, allSettled); панель действий — отдельный компонент `gallery-select-bar.tsx` (fixed над FAB). Зрители режим не видят. В конце — запись в ленту «Обновлений».

**Tech Stack:** React 19 + TypeScript, Tailwind 4, TanStack Query, lucide-react, vitest.

## Global Constraints

- Комментарии в коде — по-русски, объясняют «почему».
- Зритель (`myRole === "viewer"`) — режима выбора нет (сервер отдаёт 403).
- Удаление: владелец поездки — любые, остальные — только свои (сервер: 403 «Можно удалять только свои фото»).
- Тач-таргеты ≥ 44px (`min-h-11`/`size-11`).
- Новый API не вводится; `docs/api.md` не меняется.
- Тесты дат не затрагиваются (`bun run test` достаточно).

---

### Task 1: Чистый раннер пачки `src/lib/photo-bulk.ts` (+ тест)

**Files:**
- Create: `src/lib/photo-bulk.ts`
- Test: `src/lib/photo-bulk.test.ts`

**Interfaces:**
- Produces: `runBulk(ids: string[], worker: (id: string) => Promise<unknown>, limit?: number): Promise<{ done: string[]; failed: string[] }>`

- [ ] **Step 1: Тест (падает — модуля нет)**

```ts
import { describe, expect, it } from "vitest";
import { runBulk } from "./photo-bulk";

describe("runBulk", () => {
  it("делит на успешные и упавшие", async () => {
    const r = await runBulk(["a", "b", "c"], async (id) => {
      if (id === "b") throw new Error("403");
    });
    expect(r.done).toEqual(["a", "c"]);
    expect(r.failed).toEqual(["b"]);
  });

  it("держит не больше limit параллельных задач", async () => {
    let inFlight = 0;
    let peak = 0;
    await runBulk(["1", "2", "3", "4", "5"], async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    }, 2);
    expect(peak).toBe(2);
  });

  it("пустой список — пустой результат", async () => {
    expect(await runBulk([], async () => {})).toEqual({ done: [], failed: [] });
  });
});
```

- [ ] **Step 2: `bunx vitest run src/lib/photo-bulk.test.ts` → FAIL (cannot find module)**

- [ ] **Step 3: Реализация**

```ts
// Пачка мутаций галереи: ограниченная параллельность (сотни последовательных
// запросов медленно, неограниченных — шквал), итог делится на сделанные/упавшие.
export interface BulkResult {
  done: string[];
  failed: string[];
}

export async function runBulk(
  ids: string[],
  worker: (id: string) => Promise<unknown>,
  limit = 4,
): Promise<BulkResult> {
  const done: string[] = [];
  const failed: string[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await worker(id);
        done.push(id);
      } catch {
        failed.push(id);
      }
    }
  });
  await Promise.all(runners);
  return { done, failed };
}
```

- [ ] **Step 4: `bunx vitest run src/lib/photo-bulk.test.ts` → PASS**

- [ ] **Step 5: Commit** `feat: чистый раннер пачки мутаций (photo-bulk)`

---

### Task 2: Хук долгого нажатия `src/hooks/use-long-press.ts`

**Files:**
- Create: `src/hooks/use-long-press.ts`

**Interfaces:**
- Produces: `useLongPress(onLongPress: () => void, enabled: boolean): { onPointerDown; onPointerUp; onPointerLeave; onPointerCancel; firedRef: React.MutableRefObject<boolean> }` — `firedRef.current` сбрасывает пропуск клика после сработавшего долгого нажатия.

- [ ] **Step 1: Реализация** (без unit-теста — тонкая обвязка DOM-событий, поведение проверяется вживую; чистой логики почти нет)

```ts
"use client";

import { useCallback, useRef } from "react";

/** Долгое нажатие (~500мс) для входа в мультивыбор: таймер на pointerdown,
    любая отмена (отпускание, уход курсора, скролл) его гасит. Если таймер
    сработал — последующий click надо пропустить (firedRef). */
export function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    firedRef.current = false;
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      firedRef.current = true;
      onLongPress();
    }, 500);
  }, [enabled, onLongPress, clear]);

  const stop = useCallback(() => {
    clear();
  }, [clear]);

  return { onPointerDown, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, firedRef };
}
```

- [ ] **Step 2: `bun run lint` → без новых ошибок**

---

### Task 3: Плитки — пропы выбора (`gallery-tile.tsx`)

**Files:**
- Modify: `src/components/trip/gallery-tile.tsx`

**Interfaces:**
- Consumes: `useLongPress` (Task 2)
- Produces: `TileProps` расширен: `selecting?: boolean; selected?: boolean; onToggleSelect?: () => void; onLongPress?: () => void;` — при `selecting` клик вызывает `onToggleSelect`, иначе `onOpen(index)`; на выбранной плитке — чекбокс-уголок.

- [ ] **Step 1: В `MasonryTile`/`CompactTile` добавить пропы и логику** — `common.onClick` учитывает `selecting`/`firedRef`; в body — чекбокс:

```tsx
interface TileProps {
  photo: Photo;
  index: number;
  onOpen: (index: number) => void;
  /** Режим мультивыбора: клик — toggle выбора, долгий тап включил его */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}
```

Чекбокс-уголок (в начало body, верхний левый угол):

```tsx
{selecting && (
  <span
    className={cn(
      "absolute top-1.5 left-1.5 z-10 size-6 rounded-md border grid place-items-center pointer-events-none",
      selected ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/60",
    )}
    aria-hidden="true"
  >
    {selected && <Check className="size-4" />}
  </span>
)}
```

Клик: `onClick: () => { if (longPress.firedRef.current) { longPress.firedRef.current = false; return; } if (selecting) onToggleSelect?.(); else onOpen(index); }`

Долгое нажатие: `const longPress = useLongPress(() => onLongPress?.(), !!selecting || !!onLongPress)` + обработчики pointer* на кнопку.

- [ ] **Step 2: `bun run lint` → чисто**

---

### Task 4: Панель действий `gallery-select-bar.tsx`

**Files:**
- Create: `src/components/trip/gallery-select-bar.tsx`

**Interfaces:**
- Consumes: lucide `Star, EyeOff, Eye, Trash2, Check, X`
- Produces: `GallerySelectBar({ count, allFavorite, allHidden, deletableCount, pending, onFavorite, onHidden, onDelete, onSelectAll, onClear, onDone })`

- [ ] **Step 1: Реализация** — `fixed inset-x-3 bottom-24 z-30 rounded-2xl border bg-card shadow-lg p-2 space-y-2` (над FAB), ряд: «Выбрано N» + «Выбрать всё/Снять всё», ряд кнопок: избранное (динамическая подпись), скрытие, удалить (AlertDialog; при `deletableCount < count` текст «Будут удалены ваши кадры: M, чужие будут пропущены», при M=0 — disabled), «Готово» (X). Все кнопки `min-h-11`.

- [ ] **Step 2: `bun run lint` → чисто**

---

### Task 5: Сборка в `gallery.tsx`

**Files:**
- Modify: `src/components/trip/gallery.tsx`

**Interfaces:**
- Consumes: Task 1–4; `useBackDismiss(open, close)`; `haptic()` из `@/lib/utils`; `useUpdatePhoto`-стиль fetch (PATCH `/api/photos/:id`, DELETE `/api/photos?id=`)
- Produces: рабочая фича.

- [ ] **Step 1: Состояние и вход**

```tsx
const isViewer = myRole === "viewer";
const [selectMode, setSelectMode] = useState(false);
const [selected, setSelected] = useState<Set<string>>(new Set());
const exitSelectMode = useCallback(() => {
  setSelectMode(false);
  setSelected(new Set());
}, []);
useBackDismiss(selectMode, exitSelectMode);
const toggleSelect = useCallback((id: string) => {
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);
const enterSelect = useCallback((id?: string) => {
  setSelectMode(true);
  setSelected(id ? new Set([id]) : new Set());
  haptic(15);
}, []);
```

- [ ] **Step 2: Кнопка «Выбрать»** — первая в кластере иконок (только для не-зрителя), в режиме выбора превращается в «Готово» (`exitSelectMode`).

- [ ] **Step 3: Плитки** — прокинуть `selecting/selected/onToggleSelect/onLongPress` (в обычном режиме — `undefined`, memo не страдает); long-press плитки → `enterSelect(photo.id)`.

- [ ] **Step 4: Мутации пачкой**

```tsx
const [bulkPending, setBulkPending] = useState(false);
const runBulkAction = async (kind: "favorite" | "unfavorite" | "hide" | "unhide" | "delete") => {
  const ids = [...selected];
  setBulkPending(true);
  const { done, failed } = await runBulk(ids, async (id) => {
    if (kind === "delete") {
      const r = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } else {
      const patch = kind === "favorite" ? { isFavorite: true } : kind === "unfavorite" ? { isFavorite: false } : kind === "hide" ? { hiddenFromPublic: true } : { hiddenFromPublic: false };
      const r = await fetch(`/api/photos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error();
    }
  });
  setBulkPending(false);
  qc.invalidateQueries({ queryKey: ["photos"] });
  qc.invalidateQueries({ queryKey: ["photos-geo"] });
  invalidateRouteData(qc);
  if (failed.length === 0) {
    toast.success(...итог по kind);
    exitSelectMode();
  } else {
    setSelected(new Set(failed));
    toast.error(`Готово ${done.length}, не удалось ${failed.length}`);
  }
};
```

(`qc` — `useQueryClient()` в компоненте.)

- [ ] **Step 5: Панель** — рендер `GallerySelectBar` при `selectMode`; производные: `selectedPhotos = ordered.filter(p => selected.has(p.id))`, `allFavorite`/`allHidden`, `deletableCount` (owner: все; иначе `p.userId === currentUserId`).

- [ ] **Step 6: lint + `bun run test` → зелёные**

- [ ] **Step 7: Живая проверка в браузере** — сеять 6 тестовых фото (1 скрытое), 360px: долгий тап → кластер + хаптика, выбор, «В избранное», скрытие, удаление (owner — всё), панель счётчиками; 1280px — кнопка «Выбрать». Убрать стенд.

- [ ] **Step 8: Commit** `feat: мультивыбор фото в галерее — избранное, скрытие, удаление пачкой`

---

### Task 6: «Обновления» + доки

**Files:**
- Modify: `src/lib/updates-content.ts` (запись СВЕРХУ `UPDATES`)
- Modify: `docs/glossary.md` (строка галереи), `worklog.md` (сессия)

- [ ] **Step 1: Запись** id `2026-11-12-galereya-sortirovka-i-vybor`, kind `better`, area `trip`, icon `🖼️`, demo из 2 MockScene-экранов (сортировка: бар с чипами и стрелкой; мультивыбор: плитки с чекбоксами + панель «Выбрано 3»), labels — только строки, дословно существующие в исходниках («Сначала старые», «Выбрать всё», «Готово», «Скрыть от гостей», «В избранное»).

- [ ] **Step 2: `bunx vitest run src/lib/updates-content.test.ts src/lib/updates.test.ts` → PASS** (label-сверка)

- [ ] **Step 3: glossary — дополнить строку `gallery` (мультивыбор: вход долгим тапом/кнопкой, действия, права)**

- [ ] **Step 4: worklog — сессия 2026-11-12 (мультивыбор)**

- [ ] **Step 5: Commit + push** `feat: мультивыбор фото + запись «Обновлений»`
