# Волна 2 «Тактильность и отзывчивость» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение отвечает пальцу: хаптика на успешных действиях, pull-to-refresh на любом табе, тик при переключении вкладки.

**Architecture:** Чистая машина состояний PTR (`src/lib/pull-refresh.ts`, TDD) + touch-хук (`use-pull-to-refresh.ts`) + узкий индикатор под шапкой; refresh = широкая инвалидация (активный таб перечитывает своё). Хаптика — точечные `haptic()` на успехах. Свайп вкладок отложен (конфликты жестов, рекогнесенс 2026-11-12).

**Tech Stack:** Touch events, `matchMedia("(pointer: coarse)")`, существующие `haptic()`/`Skeleton`/queryKeys, vitest node-env.

Спека: `docs/superpowers/specs/2026-11-12-delights-wave-2-design.md`

## Global Constraints

- Комментарии — по-русски, «почему»; ноль новых зависимостей; ни схемы, ни API.
- Хаптика только на успешные действия; ошибки молчат.
- PTR не должен срабатывать внутри оверлеев/шитов (у тех scroll-lock и `overscroll-contain`) и на десктопе.
- Тесты vitest node-env рядом с модулем; lint 0; tsc чист; suite зелёный.
- `scroll-behavior: smooth` на html (globals.css:131) — учитывать при сбросе.

---

### Task 1: Машина состояний PTR (`src/lib/pull-refresh.ts`, TDD)

**Files:**
- Create: `src/lib/pull-refresh.ts`
- Test: `src/lib/pull-refresh.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces (Task 3): `PULL_THRESHOLD = 72`; `pullDistance(raw: number): number`; `pullOnMove(phase: PullPhase, distance: number): { phase: PullPhase; tick: boolean }`; `pullOnRelease(phase: PullPhase): PullPhase`; тип `PullPhase = "idle" | "pulling" | "armed" | "refreshing"`.

- [x] **Step 1: Падающий тест** `src/lib/pull-refresh.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD, pullDistance, pullOnMove, pullOnRelease } from "./pull-refresh";

describe("pullDistance — нормализация с сопротивлением", () => {
  it("первые 36px один к одному", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(36)).toBe(36);
  });
  it("дальше — затухание ×0.4, шапка 120", () => {
    expect(pullDistance(136)).toBe(76); // 36 + 100*0.4
    expect(pullDistance(336)).toBe(120);
    expect(pullDistance(1000)).toBe(120);
  });
});

describe("pullOnMove", () => {
  it("палец вернулся к краю — idle", () => {
    expect(pullOnMove("pulling", 0)).toEqual({ phase: "idle", tick: false });
  });
  it("тянем — pulling; пересёк порог — armed и tick один раз", () => {
    expect(pullOnMove("idle", 10)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", 30)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", PULL_THRESHOLD + 1)).toEqual({ phase: "armed", tick: true });
    expect(pullOnMove("armed", PULL_THRESHOLD + 20)).toEqual({ phase: "armed", tick: false });
  });
  it("вернулся под порог — снова pulling, повторное пересечение снова тикает", () => {
    expect(pullOnMove("armed", 20)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", PULL_THRESHOLD + 5)).toEqual({ phase: "armed", tick: true });
  });
  it("во время refreshing движение игнорируется", () => {
    expect(pullOnMove("refreshing", 500)).toEqual({ phase: "refreshing", tick: false });
  });
});

describe("pullOnRelease", () => {
  it("armed → refreshing, иначе — idle; refreshing не трогаем", () => {
    expect(pullOnRelease("armed")).toBe("refreshing");
    expect(pullOnRelease("pulling")).toBe("idle");
    expect(pullOnRelease("idle")).toBe("idle");
    expect(pullOnRelease("refreshing")).toBe("refreshing");
  });
});
```

- [x] **Step 2: Падает** (`bunx vitest run src/lib/pull-refresh.test.ts`)
- [x] **Step 3: Реализация** `src/lib/pull-refresh.ts`:

```ts
// Pull-to-refresh: чистая машина состояний. Touch-хук (use-pull-to-refresh)
// кормит её дистанциями, она решает фазу и момент однократного тика хаптики.
// Сопротивление: первые 36px — 1:1 (отклик мгновенный), дальше ×0.4 с шапкой
// 120px — за порогом (72) палец физически проезжает ~114px, случайный рывок
// порог не берёт.

export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

export const PULL_THRESHOLD = 72;

const LINEAR = 36;
const CAP = 120;
const DAMP = 0.4;

export function pullDistance(raw: number): number {
  if (raw <= LINEAR) return Math.max(0, raw);
  return Math.min(CAP, LINEAR + (raw - LINEAR) * DAMP);
}

export function pullOnMove(phase: PullPhase, distance: number): { phase: PullPhase; tick: boolean } {
  if (phase === "refreshing") return { phase, tick: false };
  if (distance <= 0) return { phase: "idle", tick: false };
  if (distance >= PULL_THRESHOLD) return { phase: "armed", tick: phase !== "armed" };
  return { phase: "pulling", tick: false };
}

export function pullOnRelease(phase: PullPhase): PullPhase {
  return phase === "armed" ? "refreshing" : phase === "refreshing" ? "refreshing" : "idle";
}
```

- [x] **Step 4: Зелёный.**
- [x] **Step 5: Коммит** `git add src/lib/pull-refresh.ts src/lib/pull-refresh.test.ts && git commit -m "feat: чистая машина pull-to-refresh (порог, гистерезис, сопротивление)"`

---

### Task 2: Хаптика на ключевых действиях

**Files:**
- Modify: `src/components/trip/quick-add/ExpenseForm.tsx`, `src/components/trip/quick-add/JournalForm.tsx`
- Modify: чек-лист (найти: `rg -l "checklist" src/components/trip/info`), TodayList/план дня («Отметить посещённым»)
- Modify: `src/components/trip/board.tsx` (только если отправка/пин ещё без вибро — у файла есть локальный vibrate на 4+ точках)
- Modify: `src/components/trip/app-shell.tsx:422` (rail onClick)

**Interfaces:** Consumes: `haptic()` из `@/lib/utils`.

- [x] **Step 1: Расставить** `haptic()` в onSuccess успешных мутаций/отправок (точки из спеки §1). `board.tsx`: если у отправки/пина уже есть локальный `vibrate()` — не дублировать; если нет — добавить `haptic()` (локальный `vibrate` файла оставить как есть — унификация вне скоупа). Rail: `onClick={() => { haptic(10); setActiveTab(t.key); }}` — только при смене вкладки (`activeTab !== t.key`).
- [x] **Step 2: Верификация** lint / tsc / suite.
- [x] **Step 3: Коммит** `git commit -m "feat: хаптика на успешных действиях (quick-add, чек-лист, посещённое, вкладка)"`

---

### Task 3: PTR-хук + индикатор + проводка

**Files:**
- Create: `src/hooks/use-pull-to-refresh.ts`, `src/components/trip/pull-refresh-indicator.tsx`
- Modify: `src/components/trip/app-shell.tsx` (вызов хука + индикатор), `src/app/globals.css` (body overscroll)

**Interfaces:**
- Consumes: Task 1 машина; `invalidateRouteData` из `@/lib/query-keys`; `useQueryClient`; `haptic`.
- Produces: `usePullToRefresh(onRefresh: () => Promise<void> | void): { phase: PullPhase; distance: number }`.

- [x] **Step 1: Хук** — touch-события на window (passive: true кроме active-фазы), гейты:
  - `matchMedia("(pointer: coarse)")` — только тач-устройства (подписка на change);
  - `window.scrollY <= 0` при старте касания;
  - `document.body.style.overflow === "hidden"` (scroll-lock шитов, `useBodyScrollLock`) — пропускаем движение;
  - вертикальная доминанта: если |dx| > |dy| на первых ~10px — жест не наш (chip-rail'ы).
  OnRefresh → await invalidateRouteData(qc) + qc.invalidateQueries(["expenses"]) + ["photos"]; завершение → idle + `haptic(10)`.
  Точный состав гейтов согласовать с фактом `useBodyScrollLock` (`src/hooks/use-body-scroll-lock.ts`) — посмотреть, что он делает с body.

- [x] **Step 2: Индикатор** — `pull-refresh-indicator.tsx`: fixed под шапкой (`top` с учётом safe-area), pill со спиннером; фазы pulling/armed — прогресс-подсказка («Тяни ещё» / «Отпусти»), refreshing — спиннер; reduced-motion без пружины.

- [x] **Step 3: Проводка** — app-shell: `const { phase, distance } = usePullToRefresh(onRefresh)` (onRefresh через `useCallback`, qc из `useQueryClient`); рендер индикатора рядом с `<main>`. globals.css: в блок body добавить `overscroll-behavior-y: contain;` с комментом-почему.

- [x] **Step 4: Верификация** — lint / tsc / suite. **Живой прогон в браузере делает КОНТРОЛЛЕР** (суб-агентам браузер недоступен): DevTools touch-emulation на localhost:3000 — тянуть на Обзоре (должен armed+тик+refresh), в чате (не мешает скроллу), в открытом шите (не срабатывает).

- [x] **Step 5: Коммит** `git commit -m "feat: pull-to-refresh — тянешь вниз, приложение перечитывает данные"`

---

### Task 4: Доки

- [x] `AGENTS.md`: в карту репозитория — `src/lib/` строка: `` `pull-refresh.ts` (машина pull-to-refresh: порог/гистерезис/сопротивление; тесты рядом) ``; строку хука вписать туда же или в примыкающую (найти, где в карте живут `src/hooks/*` корневые).
- [x] `worklog.md`: запись сверху (Волна 2: хаптика на действиях + pull-to-refresh; почему: карта delights, тактильность; ссылки на спеку/план).
- [x] Верификация lint/tsc/suite; коммит `git commit -m "docs: волна 2 в карту репозитория, worklog"`.

---

## Self-review

1. Покрытие спеки: §1 → Task 2; §2 → Tasks 1, 3; доки → Task 4; свайп — осознанно отложен (спека §3).
2. Плейсхолдеры: Task 2 содержит «найти по grep» — это точная инструкция с критерием, не TBD; Task 3 Step 1 содержит делегированную проверку useBodyScrollLock.
3. Типы: `PullPhase`/`PULL_THRESHOLD` — единственный стык Tasks 1↔3; формулы pullDistance подтверждены тест-числами.
