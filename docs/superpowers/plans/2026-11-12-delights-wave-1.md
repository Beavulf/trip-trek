# Волна 1 «Моменты-праздники» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пиковые моменты удовольствия: CelebrationOverlay (фейерверк без зависимостей), награды вместо тостов, финал поездки (долги закрыты + авто-«Итоги» с recap-открыткой), «Чисто!» в «Сочтёмся».

**Architecture:** Только клиент. Чистые правила «когда праздновать» — `src/lib/celebrations.ts` (vitest), показ — один примитив `CelebrationOverlay` (framer-motion, reduced-motion, useBackDismiss). Триггеры: `achievements.tsx` (детекция уже есть), новый `TripFinale` в Dashboard (баннер + очередь «один момент за раз» + RecapSheet), `split/balance-tab.tsx` (compact-режим). Ни схемы, ни API, ни publish().

**Tech Stack:** framer-motion 12 (уже есть), sonner (остаётся для прочих тостов), localStorage seen-флаги, MobileBottomSheet, AnimatedNumber, ShareCard + `share-card-art` variant `summary` (уже нарисован).

Спека: `docs/superpowers/specs/2026-11-12-delights-wave-1-design.md`

## Global Constraints

- Комментарии в коде — по-русски, объясняют «почему», не «что».
- Ноль новых зависимостей: анимации только на framer-motion (уже в package.json).
- `useReducedMotion` обязателен: без анимации разлёта — статичный фейд.
- Любой новый оверлей — `useBackDismiss` (правило репо: «назад» закрывает оверлей).
- Оверлей праздника — `z-[200]` (поверх шитов `z-[100]`).
- `bun run lint` — ошибок 0; тесты `bun run test` (vitest, node-env).
- UI и тексты — по-русски, тон существующего копирайтинга (тёплый, с эмодзи).
- Коммиты мелкие, стиль репо: `feat:` / `fix:` / `docs:` / `test:` с русским описанием.
- Суммы в trip-бюджете — доллары USD в `amount`, валюта отображения — `trip.settings.currency`; в split — только центы (`formatCents`).

---

### Task 1: Чистые правила праздников `src/lib/celebrations.ts`

**Files:**
- Create: `src/lib/celebrations.ts`
- Test: `src/lib/celebrations.test.ts`

**Interfaces:**
- Consumes: ничего (standalone, без импортов из lib/achievements — чтобы vitest node-env не тянул lucide-react).
- Produces (используют Tasks 3, 5, 6):
  - `debtHadKey(tripId: string): string` → `tt-debts-had-<tripId>`
  - `debtClearSeenKey(tripId: string): string` → `tt-debts-clear-seen-<tripId>`
  - `recapSeenKey(tripId: string): string` → `tt-recap-seen-<tripId>`
  - `splitHadKey(groupId: string): string` → `tt-split-had-<groupId>`
  - `splitClearSeenKey(groupId: string): string` → `tt-split-clear-seen-<groupId>`
  - `shouldCelebrateDebts(hadDebts: boolean, nowClear: boolean, clearSeen: boolean): boolean`
  - `shouldAutoRecap(a: { finished: boolean; hasDebts: boolean; hadSpending: boolean; seen: boolean }): boolean`
  - `shouldCelebrateSplit(hadDebts: boolean, nowClear: boolean, hasActivity: boolean, clearSeen: boolean): boolean`
  - `interface CelebratedBadge { id: string; title: string; emoji: string; description: string }`
  - `interface BadgeCelebration { mode: "list" | "count"; badges: CelebratedBadge[] }`
  - `pickBadgePresentation(fresh: CelebratedBadge[]): BadgeCelebration | null`

- [ ] **Step 1: Написать падающий тест**

Создать `src/lib/celebrations.test.ts` (стиль — как `src/lib/public-share.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  debtClearSeenKey,
  debtHadKey,
  pickBadgePresentation,
  recapSeenKey,
  shouldAutoRecap,
  shouldCelebrateDebts,
  shouldCelebrateSplit,
  splitClearSeenKey,
  splitHadKey,
  type CelebratedBadge,
} from "./celebrations";

describe("ключи seen-флагов", () => {
  it("стабильны и включают id сущности с префиксом tt-", () => {
    expect(debtHadKey("t1")).toBe("tt-debts-had-t1");
    expect(debtClearSeenKey("t1")).toBe("tt-debts-clear-seen-t1");
    expect(recapSeenKey("t1")).toBe("tt-recap-seen-t1");
    expect(splitHadKey("g1")).toBe("tt-split-had-g1");
    expect(splitClearSeenKey("g1")).toBe("tt-split-clear-seen-g1");
  });
});

describe("shouldCelebrateDebts", () => {
  it("празднуем только переход «были долги → чисто» и один раз", () => {
    expect(shouldCelebrateDebts(true, false, false)).toBe(false);
    // долгов не было — нечему радоваться (пустая поездка)
    expect(shouldCelebrateDebts(false, true, false)).toBe(false);
    expect(shouldCelebrateDebts(true, true, false)).toBe(true);
    // уже праздновали
    expect(shouldCelebrateDebts(true, true, true)).toBe(false);
  });
});

describe("shouldAutoRecap", () => {
  it("авто-«Итоги»: конец, долгов нет, было что вспоминать, не показывали", () => {
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: true, seen: false })).toBe(true);
    expect(shouldAutoRecap({ finished: false, hasDebts: false, hadSpending: true, seen: false })).toBe(false);
    expect(shouldAutoRecap({ finished: true, hasDebts: true, hadSpending: true, seen: false })).toBe(false);
    // пустая поездка без трат — «итоги» пустая фраза
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: false, seen: false })).toBe(false);
    expect(shouldAutoRecap({ finished: true, hasDebts: false, hadSpending: true, seen: true })).toBe(false);
  });
});

describe("shouldCelebrateSplit", () => {
  it("требует активность, переход в ноль и непоказанный праздник", () => {
    expect(shouldCelebrateSplit(true, true, true, false)).toBe(true);
    // не было трат/переводов — «чисто» пустая фраза
    expect(shouldCelebrateSplit(true, true, false, false)).toBe(false);
    expect(shouldCelebrateSplit(false, true, true, false)).toBe(false);
    expect(shouldCelebrateSplit(true, false, true, false)).toBe(false);
    expect(shouldCelebrateSplit(true, true, true, true)).toBe(false);
  });
});

describe("pickBadgePresentation", () => {
  const badge = (id: string): CelebratedBadge => ({ id, title: id, emoji: "🏅", description: "d" });

  it("нет свежих — праздника нет", () => {
    expect(pickBadgePresentation([])).toBeNull();
  });

  it("до трёх — карточки списком, больше — счётчик", () => {
    expect(pickBadgePresentation([badge("a")]).mode).toBe("list");
    expect(pickBadgePresentation([badge("a"), badge("b"), badge("c")]).mode).toBe("list");
    expect(pickBadgePresentation([badge("a"), badge("b"), badge("c"), badge("d")]).mode).toBe("count");
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `bunx vitest run src/lib/celebrations.test.ts`
Expected: FAIL — `Failed to resolve import "./celebrations"` (модуля нет).

- [ ] **Step 3: Минимальная реализация**

Создать `src/lib/celebrations.ts`:

```ts
// Моменты-праздники: чистые правила «когда праздновать». Компоненты (TripFinale,
// split/balance-tab, achievements) решают только, где взять данные, а пороги,
// seen-ключи и подача — здесь, с тестами. Ничего не импортирует: vitest node-env
// не должен тяннуть lucide-react из lib/achievements.

/** Минимальный набор полей бейджа (структурно совместим с Badge из lib/achievements) */
export interface CelebratedBadge {
  id: string;
  title: string;
  emoji: string;
  description: string;
}

// Ключи seen-флагов в localStorage — по id поездки/группы.
export const debtHadKey = (tripId: string) => `tt-debts-had-${tripId}`;
export const debtClearSeenKey = (tripId: string) => `tt-debts-clear-seen-${tripId}`;
export const recapSeenKey = (tripId: string) => `tt-recap-seen-${tripId}`;
export const splitHadKey = (groupId: string) => `tt-split-had-${groupId}`;
export const splitClearSeenKey = (groupId: string) => `tt-split-clear-seen-${groupId}`;

/** Долги закрыты: долг был → стало чисто → ещё не праздновали */
export function shouldCelebrateDebts(hadDebts: boolean, nowClear: boolean, clearSeen: boolean): boolean {
  return hadDebts && nowClear && !clearSeen;
}

/** Авто-«Итоги»: конец поездки, долгов нет, было что вспоминать (иначе пустая фраза), не показывали */
export function shouldAutoRecap(a: {
  finished: boolean;
  hasDebts: boolean;
  hadSpending: boolean;
  seen: boolean;
}): boolean {
  return a.finished && !a.hasDebts && a.hadSpending && !a.seen;
}

/** «Чисто!» в «Сочтёмся»: то же, что shouldCelebrateDebts, плюс была ли вообще активность */
export function shouldCelebrateSplit(
  hadDebts: boolean,
  nowClear: boolean,
  hasActivity: boolean,
  clearSeen: boolean
): boolean {
  return hasActivity && hadDebts && nowClear && !clearSeen;
}

export interface BadgeCelebration {
  mode: "list" | "count";
  badges: CelebratedBadge[];
}

/** ≤3 свежих награды — карточки списком; больше — «Новых наград: N» */
export function pickBadgePresentation(fresh: CelebratedBadge[]): BadgeCelebration | null {
  if (fresh.length === 0) return null;
  return { mode: fresh.length <= 3 ? "list" : "count", badges: fresh };
}
```

- [ ] **Step 4: Запустить тест — зелёный**

Run: `bunx vitest run src/lib/celebrations.test.ts`
Expected: PASS, `Test Files 1 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/celebrations.ts src/lib/celebrations.test.ts
git commit -m "feat: чистые правила моментов-праздников (seen-ключи, пороги, подача наград)"
```

---

### Task 2: CelebrationOverlay — примитив праздника

**Files:**
- Create: `src/components/trip/celebration-overlay.tsx`

**Interfaces:**
- Consumes: `haptic(ms | pattern)` из `@/lib/utils` (уже есть, `navigator.vibrate`); `useBackDismiss(open, close)` из `@/hooks/use-back-dismiss`.
- Produces (используют Tasks 3, 5, 6):

```ts
export interface CelebrationItem { id?: string; emoji: string; title: string; note?: string }
export interface CelebrationAction { label: string; onClick: () => void }
export function CelebrationOverlay(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emoji: string;
  title: string;
  subtitle?: string;
  items?: CelebrationItem[];
  actions?: CelebrationAction[];
  compact?: boolean;
}): JSX.Element | null
```

- [ ] **Step 1: Написать компонент**

Создать `src/components/trip/celebration-overlay.tsx`:

```tsx
"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { haptic } from "@/lib/utils";

export interface CelebrationItem {
  id?: string;
  emoji: string;
  title: string;
  note?: string;
}

export interface CelebrationAction {
  label: string;
  onClick: () => void;
}

interface CelebrationOverlayProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Главный эмодзи карточки */
  emoji: string;
  title: string;
  subtitle?: string;
  /** Строки-бейджи под заголовком (награды и т.п.) */
  items?: CelebrationItem[];
  actions?: CelebrationAction[];
  /** Компакт: без фейерверка, мельче — для делового «Сочтёмся» */
  compact?: boolean;
}

// Фейерверк без библиотек: эмодзи путешествий + кружки палитры приложения
// (терракота/золото/роза — как градиенты Обзора и наград).
const BURST_EMOJI = ["✈️", "🎉", "📸", "⛰️", "🍜", "🧭"];
const BURST_COLORS = ["#f97316", "#f59e0b", "#f43f5e", "#10b981", "#06b6d4"];

interface Particle {
  emoji?: string;
  color?: string;
  /** полярный разлёт из центра экрана */
  angle: number;
  dist: number;
  delay: number;
  size: number;
  dur: number;
  spin: number;
}

function makeParticles(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const isEmoji = i % 2 === 0;
    out.push({
      emoji: isEmoji ? BURST_EMOJI[Math.floor((i / 2) % BURST_EMOJI.length)] : undefined,
      color: isEmoji ? undefined : BURST_COLORS[i % BURST_COLORS.length],
      angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
      dist: 120 + Math.random() * 140,
      delay: Math.random() * 0.35,
      size: isEmoji ? 16 + Math.random() * 14 : 6 + Math.random() * 6,
      dur: 1.6 + Math.random() * 0.9,
      spin: Math.random() * 240 - 120,
    });
  }
  return out;
}

export function CelebrationOverlay({
  open,
  onOpenChange,
  emoji,
  title,
  subtitle,
  items,
  actions,
  compact,
}: CelebrationOverlayProps) {
  const reduce = useReducedMotion();
  // «назад» на телефоне закрывает праздник, а не сворачивает PWA (правило репо)
  useBackDismiss(open, () => onOpenChange(false));

  // Хаптика — только на реальном открытии; паттерн как у разблокировки наград
  useEffect(() => {
    if (open) haptic([30, 40, 30]);
  }, [open]);

  // Автозакрытие — только когда нет действий: с ними пусть пользователь решает сам
  const hasActions = !!actions && actions.length > 0;
  useEffect(() => {
    if (!open || hasActions) return;
    const t = setTimeout(() => onOpenChange(false), 5000);
    return () => clearTimeout(t);
  }, [open, hasActions, onOpenChange]);

  // Частицы пересобираем на каждый показ — разлёт каждый раз другой;
  // reduced-motion и compact — без фейерверка вовсе
  const particles = useMemo(
    () => (open && !compact && !reduce ? makeParticles(26) : []),
    [open, compact, reduce]
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="celebration-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
        >
          {/* Фейерверк: частицы разлетаются из-за карточки и гаснут */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {particles.map((p, i) => (
              <motion.span
                key={i}
                className={p.emoji ? "absolute left-1/2 top-1/2" : "absolute left-1/2 top-1/2 rounded-full"}
                style={p.emoji ? { fontSize: p.size } : { width: p.size, height: p.size, background: p.color }}
                initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                animate={{
                  x: Math.cos(p.angle) * p.dist,
                  y: Math.sin(p.angle) * p.dist + 40, // лёгкая «гравитация» вниз
                  opacity: [0, 1, 1, 0],
                  rotate: p.spin,
                }}
                transition={{ duration: p.dur, delay: p.delay, ease: "easeOut", times: [0, 0.15, 0.6, 1] }}
              >
                {p.emoji}
              </motion.span>
            ))}
          </div>

          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className={
              compact
                ? "relative w-full max-w-xs rounded-3xl border border-border bg-card p-5 text-center shadow-2xl"
                : "relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
            }
          >
            <motion.div
              className={compact ? "text-5xl" : "text-6xl"}
              initial={reduce ? undefined : { scale: 0, rotate: -20 }}
              animate={reduce ? undefined : { scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
              aria-hidden
            >
              {emoji}
            </motion.div>
            <h2 className="mt-2 text-lg font-bold leading-snug">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            {items && items.length > 0 && (
              <ul className="mt-3 space-y-2 text-left">
                {items.map((it, i) => (
                  <li
                    key={it.id ?? `${i}-${it.title}`}
                    className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <span className="text-xl leading-none" aria-hidden>{it.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">{it.title}</span>
                      {it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center rounded-xl border border-input px-4 text-sm font-medium text-muted-foreground transition-transform hover:text-foreground active:scale-[0.98]"
              >
                Понятно
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
```

Замечания для исполнителя:
- Паттерн «AnimatePresence внутри, ранний return null только для SSR» — как в `mobile-bottom-sheet.tsx` (там же комментарий про exit-анимацию: условие `{open && ...}` внутри AnimatePresence, не ранний return).
- Токены `bg-card`/`border-border`/`text-muted-foreground` — тема подхватится и в изумрудном `/split`.

- [ ] **Step 2: Линт**

Run: `bun run lint`
Expected: 0 ошибок (предупреждения set-state-in-effect — известный долг репо, не трогать).

- [ ] **Step 3: Коммит**

```bash
git add src/components/trip/celebration-overlay.tsx
git commit -m "feat: CelebrationOverlay — примитив моментов-праздников (фейерверк на framer-motion, reduced-motion, back-dismiss)"
```

---

### Task 3: Награды — оверлей вместо пачки тостов

**Files:**
- Modify: `src/lib/achievements.ts:220` (сигнатура `describeBadge`)
- Modify: `src/components/trip/achievements.tsx` (импорт, state, эффект :182-210, render :378-388)

**Interfaces:**
- Consumes: `pickBadgePresentation`, `CelebratedBadge`, `BadgeCelebration` из Task 1; `CelebrationOverlay`, `CelebrationItem` из Task 2.
- Produces: ничего наружу.

- [ ] **Step 1: Ослабить сигнатуру `describeBadge`**

`src/lib/achievements.ts:220` — функция использует только `a.id`, `a.description`, `a.target`, но тип требует полный `AchievementDef` (icon/check/cta), которого у `CelebratedBadge` нет. Заменить:

```ts
export function describeBadge(a: AchievementDef & { target?: number }, sym: string): string {
```

на:

```ts
// Минимальный структурный тип: у CelebratedBadge из lib/celebrations нет icon/check/cta,
// а функции нужны только id/description/target
export function describeBadge(a: { id: string; description: string; target?: number }, sym: string): string {
```

- [ ] **Step 2: Проверить всех вызывающих**

Run: `rg -n "describeBadge" src --glob '!**/*.test.*'`
Expected: только `src/lib/achievements.ts` и `src/components/trip/achievements.tsx`; все вызовы получают `Badge` (он структурно совместим с новым типом — поля superset). Если нашлись другие файлы — тип параметра у них тоже `Badge`, менять ничего не нужно.

- [ ] **Step 3: Импорт и состояние в `achievements.tsx`**

К импортам из `@/lib/achievements` (блок `:11-18`) добавить отдельной строкой:

```tsx
import { pickBadgePresentation, type BadgeCelebration } from "@/lib/celebrations";
```

К импорту `lucide-react` (`:5`) ничего; `toast` из sonner (`:7`) остаётся — тосты нужны другим частям страницы.

Рядом с остальными `useState` (после `:128` `const [freshIds, setFreshIds] = useState<string[]>([]);`) добавить:

```tsx
const [celebration, setCelebration] = useState<BadgeCelebration | null>(null);
```

- [ ] **Step 4: Заменить тосты на праздник в эффекте детекции**

В эффекте празднования (`:185-210`) заменить блок от `if (fresh.length === 0) return;` до конца `else { toast.success(...) }` — целиком старый фрагмент:

```tsx
    const fresh = unlockedIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    saveSeen(tripId, unlockedIds);
    setFreshIds(fresh);
    buzz([30, 40, 30]);
    if (fresh.length <= 3) {
      fresh.forEach((id) => {
        const b = list.find((x) => x.id === id);
        if (b) toast.success(`🎉 Новая награда: ${b.title}`, { description: describeBadge(b, sym) });
      });
    } else {
      toast.success(`🎉 Новых наград: ${fresh.length}`, {
        description: fresh.slice(0, 5).map((id) => list.find((x) => x.id === id)?.title).filter(Boolean).join(" · "),
      });
    }
```

на:

```tsx
    const fresh = unlockedIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    saveSeen(tripId, unlockedIds);
    setFreshIds(fresh);
    buzz([30, 40, 30]);
    // Тосты заменены оверлеем-праздником: подача выше, тексты и seen-логика те же
    const freshBadges = fresh
      .map((id) => list.find((x) => x.id === id))
      .filter((b): b is Badge => !!b)
      .map(({ id, title, emoji, description }) => ({ id, title, emoji, description }));
    setCelebration(pickBadgePresentation(freshBadges));
```

- [ ] **Step 5: Отрисовать оверлей**

В конце главного return (`src/components/trip/achievements.tsx:378-388`) после `</AchievementSheet>` и перед закрывающим `</div>` вставить:

```tsx
      <CelebrationOverlay
        open={celebration !== null}
        onOpenChange={(v) => {
          if (!v) setCelebration(null);
        }}
        emoji={celebration?.badges[0]?.emoji ?? "🏅"}
        title={celebration?.mode === "count" ? `Новых наград: ${celebration.badges.length}` : "Новая награда!"}
        items={
          celebration?.mode === "list"
            ? celebration.badges.map((b) => ({ id: b.id, emoji: b.emoji, title: b.title, note: describeBadge(b, sym) }))
            : celebration?.mode === "count"
              ? celebration.badges.slice(0, 5).map((b) => ({ id: b.id, emoji: b.emoji, title: b.title }))
              : undefined
        }
        actions={[
          {
            label: "Поделиться",
            onClick: () => {
              if (!celebration) return;
              const title = trip?.settings.title;
              const lines =
                celebration.mode === "count"
                  ? [`🏅 Новых наград${title ? ` «${title}»` : ""}: ${celebration.badges.length}`, ...celebration.badges.slice(0, 5).map((b) => `✓ ${b.title}`)]
                  : [
                      `🏅 Награда${title ? ` «${title}»` : ""}!`,
                      ...celebration.badges.map((b) => `${b.emoji} ${b.title} — ${describeBadge(b, sym)}`),
                    ];
              void shareText(lines.join("\n"), "Награды поездки");
              setCelebration(null);
            },
          },
          { label: "Круто!", onClick: () => setCelebration(null) },
        ]}
      />
```

И добавить импорт компонента к импортам `./`-файлов (рядом с `import { MobileBottomSheet } from "./mobile-bottom-sheet";` `:19`):

```tsx
import { CelebrationOverlay } from "./celebration-overlay";
```

- [ ] **Step 6: Линт**

Run: `bun run lint`
Expected: 0 ошибок. Если ругается на неиспользуемый `toast` — не удалится: тосты остались в других местах файла (share-фолбэки, ошибки refetch).

- [ ] **Step 7: Коммит**

```bash
git add src/lib/achievements.ts src/components/trip/achievements.tsx
git commit -m "feat: разблокировка награды — праздник-оверлей вместо пачки тостов"
```

---

### Task 4: RecapSheet «Итоги поездки» + `initialVariant` у ShareCard

**Files:**
- Modify: `src/components/trip/share-card.tsx:25,34` (проп + начальный вариант)
- Create: `src/components/trip/dashboard/recap-sheet.tsx`

**Interfaces:**
- Consumes: `MobileBottomSheet` (`open`, `onOpenChange`, `title`, children) из `../mobile-bottom-sheet`; `AnimatedNumber({ value, format, duration? })` из `../budget/AnimatedNumber`; `useTrip()` → `TripSummary` (поля `settings.totalDays/settings.title/settings.currency`, `visitedPlaces`, `totalPlaces`, `totalPhotos`, `totalJournals`, `totalSpent`); `currencySymbol(currency)` из `@/lib/currencies`; `plural(n, one, few, many)` из `@/lib/utils`; `CardVariantId` из `../share-card-art`.
- Produces: `ShareCard({ open, onOpenChange, initialVariant? })` — новый опциональный проп; `RecapSheet({ open, onOpenChange })` — использует Task 5.

- [ ] **Step 1: Добавить `initialVariant` в ShareCard**

`src/components/trip/share-card.tsx:25` — заменить:

```tsx
export function ShareCard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
```

на:

```tsx
export function ShareCard({
  open,
  onOpenChange,
  // С какого варианта начать: «Итоги» RecapSheet'а открывает сразу summary.
  // ShareCard монтируется только при открытом шите (app-shell: {shareOpen && ...}),
  // поэтому начального значения достаточно — pickVariant и дальше рулит сменой.
  initialVariant = "story",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialVariant?: CardVariantId;
}) {
```

и `:34` — заменить:

```tsx
  const [variantId, setVariantId] = useState<CardVariantId>("story");
```

на:

```tsx
  const [variantId, setVariantId] = useState<CardVariantId>(initialVariant);
```

- [ ] **Step 2: Написать RecapSheet**

Создать `src/components/trip/dashboard/recap-sheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTrip } from "@/hooks/use-trip";
import { currencySymbol } from "@/lib/currencies";
import { plural } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AnimatedNumber } from "../budget/AnimatedNumber";
import { ShareCard } from "../share-card";

// «Итоги поездки»: анимированные цифры момента + готовая открытка summary
// (в share-card-art это «ночная сводка закрывшейся поездки» — арт писать не нужно).
// Открывается праздничной кнопкой баннера финала и авто-моментом TripFinale.
export function RecapSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: trip } = useTrip();
  const [cardOpen, setCardOpen] = useState(false);
  if (!trip) return null;
  const sym = currencySymbol(trip.settings.currency);

  const int = (v: number) => String(Math.round(v));
  const money = (v: number) => `${sym}${Math.round(v).toLocaleString("ru-RU")}`;
  const stats = [
    { emoji: "🗓", value: trip.settings.totalDays, format: int, label: plural(trip.settings.totalDays, "день", "дня", "дней") },
    { emoji: "📍", value: trip.visitedPlaces, format: int, label: `из ${trip.totalPlaces} мест` },
    { emoji: "📸", value: trip.totalPhotos, format: int, label: "фото" },
    { emoji: "📔", value: trip.totalJournals, format: int, label: plural(trip.totalJournals, "запись", "записи", "записей") },
    { emoji: "💰", value: trip.totalSpent, format: money, label: "потрачено" },
  ];

  return (
    <>
      <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Итоги поездки">
        <div className="space-y-3 pb-4">
          <p className="truncate text-center text-sm text-muted-foreground">Поездка «{trip.settings.title}»</p>
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s, i) => (
              <motion.div
                key={s.emoji}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, ease: "easeOut" }}
                className={
                  "rounded-2xl border border-border bg-card p-4 text-center" +
                  (i === stats.length - 1 ? " col-span-2" : "")
                }
              >
                <div className="text-2xl" aria-hidden>
                  {s.emoji}
                </div>
                <div className="mt-1 text-2xl font-bold leading-none tabular-nums">
                  <AnimatedNumber value={s.value} format={s.format} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Открытка «Итоги» →
          </button>
        </div>
      </MobileBottomSheet>
      {/* Открытка поверх шита итогов: закрыли открытку — остались в «Итогах» */}
      {cardOpen && <ShareCard open initialVariant="summary" onOpenChange={setCardOpen} />}
    </>
  );
}
```

- [ ] **Step 3: Линт**

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/trip/share-card.tsx src/components/trip/dashboard/recap-sheet.tsx
git commit -m "feat: RecapSheet «Итоги поездки» (count-up цифры) + initialVariant у ShareCard"
```

---

### Task 5: TripFinale — праздничный баннер, «долги закрыты», авто-«Итоги»

**Files:**
- Modify: `src/components/trip/dashboard/TripFinishedBanner.tsx:20,84-88` (проп + праздничная ветка)
- Create: `src/components/trip/dashboard/trip-finale.tsx`
- Modify: `src/components/trip/dashboard/Dashboard.tsx:16,105` (маунт)

**Interfaces:**
- Consumes: `debtHadKey`, `debtClearSeenKey`, `recapSeenKey`, `shouldCelebrateDebts`, `shouldAutoRecap` (Task 1); `CelebrationOverlay` (Task 2); `RecapSheet` (Task 4); `isTripFinished(endDate, status)` из `@/lib/trip-days`; `calculateSettlements`, `moneyParticipants` из `@/lib/budget`; `useCurrentTripId/useTrip/useExpenses` из `@/hooks/use-trip`.
- Produces: `TripFinishedBanner({ onShowRecap? })` — новый опциональный проп; `TripFinale()` — монтируется в Dashboard вместо `<TripFinishedBanner />`.

- [ ] **Step 1: Праздничная ветка баннера**

`src/components/trip/dashboard/TripFinishedBanner.tsx` — заменить сигнатуру (`:20`):

```tsx
export function TripFinishedBanner() {
```

на:

```tsx
export function TripFinishedBanner({ onShowRecap }: { onShowRecap?: () => void }) {
```

Заменить ветку без долгов (`:84-88`):

```tsx
          ) : (
            <p className="text-xs text-muted-foreground">
              {hadSpending ? "Все долги закрыты — поездка удалась ✨" : "Поездка позади. Долгов нет — осталось собрать воспоминания ✨"}
            </p>
          )}
```

на:

```tsx
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {hadSpending
                  ? "Поездка состоялась — все долги закрыты 🎉"
                  : "Поездка позади. Долгов нет — осталось собрать воспоминания ✨"}
              </p>
              {/* Финальный момент: итоги поездки поверх готовой открытки summary */}
              {hadSpending && onShowRecap && (
                <button
                  type="button"
                  onClick={onShowRecap}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 text-xs font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  Смотреть итоги →
                </button>
              )}
            </>
          )}
```

Комментарий-шапку баннера (`:15-18`) дополнить одной строкой: `// Праздничная ветка (долгов нет) даёт кнопку «Смотреть итоги» — RecapSheet рендерит TripFinale.`

- [ ] **Step 2: Написать TripFinale**

Создать `src/components/trip/dashboard/trip-finale.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTripId, useExpenses, useTrip } from "@/hooks/use-trip";
import { calculateSettlements, moneyParticipants } from "@/lib/budget";
import { isTripFinished } from "@/lib/trip-days";
import {
  debtClearSeenKey,
  debtHadKey,
  recapSeenKey,
  shouldAutoRecap,
  shouldCelebrateDebts,
} from "@/lib/celebrations";
import { CelebrationOverlay } from "../celebration-overlay";
import { RecapSheet } from "./recap-sheet";
import { TripFinishedBanner } from "./TripFinishedBanner";

// Оркестратор финала поездки: баннер + авто-моменты «долги закрыты» и «Итоги».
// Все пороги — чистые правила lib/celebrations; здесь только данные и очередь:
// один момент за раз, «Итоги» открываются после закрытия праздника долгов.
export function TripFinale() {
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const { data: expenses } = useExpenses();
  const [debtsClearOpen, setDebtsClearOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // Праздник долгов открыт и/или recap в очереди: ref, чтобы эффект не зависел от UI-состояния
  const queueBusy = useRef(false);

  const ready = !!tripId && !!trip && !!expenses;
  const finished = !!trip && isTripFinished(trip.settings.endDate, trip.trip?.status);
  // Те же «участники денег», что в баннере и на вкладке Бюджет: долги ушедших не превращаются в «чисто»
  const people = trip ? moneyParticipants(trip.participants, trip.formerParticipants, expenses ?? []) : [];
  const settlements = trip ? calculateSettlements(expenses ?? [], people) : [];
  const debtTotal = settlements.reduce((s, x) => s + x.amount, 0);
  const hasDebts = debtTotal > 0.005;
  const hadSpending = (expenses ?? []).some((e) => e.category !== "settlement");

  useEffect(() => {
    if (!ready || !finished || !tripId) return;
    const get = (k: string): string | null => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null; // приватный режим — без праздников
      }
    };
    const mark = (k: string) => {
      try {
        localStorage.setItem(k, "1");
      } catch {
        /* приватный режим */
      }
    };

    if (hasDebts) {
      mark(debtHadKey(tripId));
      return;
    }
    const had = !!get(debtHadKey(tripId));
    if (shouldCelebrateDebts(had, true, !!get(debtClearSeenKey(tripId)))) {
      mark(debtClearSeenKey(tripId));
      // «Итоги» ещё не показывали? Покажем сразу после закрытия праздника.
      // seen отмечаем сейчас: решение показать принято, повторный прогон эффекта не должен его отменить
      queueBusy.current = shouldAutoRecap({ finished: true, hasDebts: false, hadSpending, seen: false });
      if (queueBusy.current) mark(recapSeenKey(tripId));
      setDebtsClearOpen(true);
      return;
    }
    if (queueBusy.current) return; // recap ждёт закрытия праздника
    if (shouldAutoRecap({ finished: true, hasDebts: false, hadSpending, seen: !!get(recapSeenKey(tripId)) })) {
      mark(recapSeenKey(tripId));
      // Задержка: дать Обзору дообитать, оверлей не бьёт по открывшему приложение
      const t = setTimeout(() => setRecapOpen(true), 1000);
      return () => clearTimeout(t);
    }
  }, [ready, finished, tripId, hasDebts, hadSpending]);

  const closeDebtsClear = (openRecap: boolean) => {
    setDebtsClearOpen(false);
    if (openRecap && queueBusy.current) {
      queueBusy.current = false;
      setTimeout(() => setRecapOpen(true), 350);
    } else {
      queueBusy.current = false;
    }
  };

  return (
    <>
      <TripFinishedBanner onShowRecap={() => setRecapOpen(true)} />
      <CelebrationOverlay
        open={debtsClearOpen}
        onOpenChange={(v) => {
          if (!v) closeDebtsClear(true);
        }}
        emoji="🤝"
        title="Все долги закрыты!"
        subtitle="Ни одного хвоста — поездка завершена красиво."
        actions={[
          { label: "Итоги поездки", onClick: () => closeDebtsClear(true) },
          { label: "Понятно", onClick: () => closeDebtsClear(false) },
        ]}
      />
      <RecapSheet open={recapOpen} onOpenChange={setRecapOpen} />
    </>
  );
}
```

- [ ] **Step 3: Смонтировать в Dashboard**

`src/components/trip/dashboard/Dashboard.tsx:16` — заменить импорт:

```tsx
import { TripFinishedBanner } from "./TripFinishedBanner";
```

на:

```tsx
import { TripFinale } from "./trip-finale";
```

и `:105` — заменить `<TripFinishedBanner />` на `<TripFinale />`.

- [ ] **Step 4: Линт**

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/components/trip/dashboard/TripFinishedBanner.tsx src/components/trip/dashboard/trip-finale.tsx src/components/trip/dashboard/Dashboard.tsx
git commit -m "feat: финал поездки — праздничный баннер, «долги закрыты», авто-«Итоги» (TripFinale)"
```

---

### Task 6: «Сочтёмся» — «Чисто! 🤝» на вкладке Баланса

**Files:**
- Modify: `src/components/split/balance-tab.tsx` (импорты `:3`, состояние/эффект после `:124`, render перед `:282`)

**Interfaces:**
- Consumes: `GroupModel` (`status`, `debts`, `balances`, `expenses`, `payments`, `group.id`) из `@/hooks/split/use-group-model`; `splitHadKey`, `splitClearSeenKey`, `shouldCelebrateSplit` (Task 1); `CelebrationOverlay` (Task 2).
- Produces: ничего наружу.

- [ ] **Step 1: Импорты**

`src/components/split/balance-tab.tsx` — заменить `:3`:

```tsx
import { useState } from "react";
```

на:

```tsx
import { useEffect, useState } from "react";
```

и добавить (рядом с импортом `@/lib/split/reminders` `:11`):

```tsx
import { splitClearSeenKey, splitHadKey, shouldCelebrateSplit } from "@/lib/celebrations";
import { CelebrationOverlay } from "@/components/trip/celebration-overlay";
```

- [ ] **Step 2: Детекция «стало чисто»**

В `BalanceTab` после `:124` (`const redo = useSavePayment(group.id, me);`) добавить:

```tsx
  // Момент «Чисто!»: были долги → все балансы стали нулевыми. Пороги и seen-ключи —
  // в lib/celebrations; оптимистичные мутации двигают model в тот же кадр, что и список,
  // так что момент срабатывает сразу после закрывающего перевода.
  const [clearedOpen, setClearedOpen] = useState(false);
  const hadActivity = model.expenses.length > 0 || model.payments.length > 0;
  const nowClear = model.debts.length === 0 && [...model.balances.values()].every((v) => v === 0);

  useEffect(() => {
    if (model.status !== "ready") return;
    const get = (k: string): string | null => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const mark = (k: string) => {
      try {
        localStorage.setItem(k, "1");
      } catch {
        /* приватный режим */
      }
    };
    if (!nowClear) {
      if (model.debts.length > 0) mark(splitHadKey(group.id));
      return;
    }
    if (shouldCelebrateSplit(!!get(splitHadKey(group.id)), true, hadActivity, !!get(splitClearSeenKey(group.id)))) {
      mark(splitClearSeenKey(group.id));
      setClearedOpen(true);
    }
  }, [model.status, nowClear, hadActivity, group.id, model.debts.length]);
```

- [ ] **Step 3: Отрисовать компактный оверлей**

Перед `<PaymentDetailsSheet ... />` (`:282`) вставить:

```tsx
      <CelebrationOverlay
        compact
        open={clearedOpen}
        onOpenChange={(v) => {
          if (!v) setClearedOpen(false);
        }}
        emoji="🤝"
        title="Чисто!"
        subtitle="Все расчёты по группе закрыты — никто никому не должен."
      />
```

- [ ] **Step 4: Линт**

Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/components/split/balance-tab.tsx
git commit -m "feat: «Сочтёмся» — момент «Чисто!» при закрытии всех долгов группы"
```

---

### Task 7: Доки, полная проверка, живой прогон

**Files:**
- Modify: `docs/glossary.md` (раздел «Фичи главного экрана»)
- Modify: `AGENTS.md` (карта репозитория, строка `src/lib/`)
- Modify: `worklog.md` (запись сессии)

**Interfaces:**
- Consumes: всё из Tasks 1-6.
- Produces: обновлённая документация, зелёный lint + тесты, живая проверка в браузере.

- [ ] **Step 1: Юнит-тесты и линт всего репо**

Run: `bun run test`
Expected: все зелёные, включая `src/lib/celebrations.test.ts`.
Run: `bun run lint`
Expected: 0 ошибок.

- [ ] **Step 2: Доки**

`docs/glossary.md`, раздел «Фичи главного экрана» — добавить абзац (после описания наград/Обзора, в существующем стиле):

```markdown
**Моменты-праздники** (`src/lib/celebrations.ts` — чистые правила, `src/components/trip/celebration-overlay.tsx`
— примитив с фейерверком на framer-motion). Разблокировка награды, закрытие долгов поездки,
финал поездки («Смотреть итоги» → RecapSheet с count-up цифрами и открыткой summary ShareCard)
и «Чисто!» в «Сочтёмся» показываются оверлеем вместо тостов. Однократность — seen-флаги в
localStorage (`tt-debts-*`, `tt-recap-seen-*`, `tt-split-*`); авто-моменты финала собирает
`TripFinale` (один момент за раз, recap после праздника долгов). Reduced-motion — без разлёта частиц.
```

`AGENTS.md`, таблица «Карта репозитория», строка `src/lib/` — дописать в конец ячейки (перед закрывающей `|`):

`` `celebrations.ts` (чистые правила моментов-праздников: seen-ключи, пороги, подача наград; тесты рядом) ``

`worklog.md` — добавка в начало журнала по образцу существующих записей: что сделано (4 момента + примитив), почему (карта delights 2026-11-12: не было пиковых моментов), ссылки на спеку и план.

- [ ] **Step 3: Живой прогон в браузере** *(выполняет главный агент сессии — Browser Use `browser-use:control-browser`, фолбэк chrome-devtools; суб-агентам браузер недоступен)*

Run: `bun server.ts` (dev, порт 3000). Аккаунт `you@triptrek.com` / `1234` (сид).

Сценарии:
1. **Награды**: в консоли браузера сбросить seen — `localStorage.removeItem("tt-badges-seen-<tripId>")` — обновить страницу «Награды» → должен показаться оверлей с бейджами и «Поделиться»; «Поделиться» → системный шеринг/буфер.
2. **Финал**: у сид-поездки закончить даты (правка дат в «О поездке» так, чтобы endDate был в прошлом) и иметь траты с долгами → на Обзоре появляется баннер с «Закрыть долги»; закрыть долг тратой-переводом → обратно на Обзор → оверлей «Все долги закрыты!» → «Итоги поездки» → RecapSheet с count-up → «Открытка "Итоги"» открывает ShareCard на варианте summary.
3. **Авто-«Итоги»**: перезагрузить Обзор (долги закрыты, `tt-recap-seen` отсутствует) → RecapSheet открывается сам через ~1 с; повторно — не открывается.
4. **Split**: `/split` → новая группа → трата без перевода → перевод, закрывающий долг → компактный «Чисто!»; повторный вход — не показывается.
5. **Reduced-motion**: DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` → оверлей без разлёта частиц, карточка появляется фейдом.
6. **«Назад»**: открытый оверлей + кнопка «назад» Android/жест — оверлей закрывается, приложение не сворачивается.

- [ ] **Step 4: Финальный коммит доков**

```bash
git add docs/glossary.md AGENTS.md worklog.md
git commit -m "docs: моменты-праздники в glossary и карту репозитория, запись в worklog"
```

---

## Self-review плана (выполнено при написании)

1. **Покрытие спеки:** секция 1 → Task 2; секция 2 → Task 3; секция 3 → Task 5; секция 4 → Task 4; секция 5 → Task 6; секция 6 (логика/тесты) → Task 1; доки/проверка → Task 7. Гэпов нет.
2. **Плейсхолдеры:** все шаги с кодом содержат полный код; команд с «TBD» нет.
3. **Согласованность типов:** `CelebratedBadge`/`BadgeCelebration`/`pickBadgePresentation` (Task 1) используются в Task 3 дословно; пропсы `CelebrationOverlay` из Task 2 — в Tasks 3/5/6 дословно; `initialVariant` (Task 4) — в Task 4 же; `onShowRecap` (Task 5) согласован между баннером и TripFinale. `describeBadge` использует только `id/description/target` — проверено по телу функции (`src/lib/achievements.ts:220-224`).
