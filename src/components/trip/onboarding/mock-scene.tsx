"use client";

// Мини-макеты обучения: рисуют MockScene (данные из lib/onboarding-scene.ts) в токенах темы
// и «водят пальцем» — курсор доезжает до цели, нажимает, и экран меняется. Всё кодом:
// под светлую и тёмную тему, акцент раздела («Сочтёмся» зелёный) берётся из --primary,
// ничего не весит и не устаревает, как записанные GIF.

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MockBlock, MockScene, MockTone } from "@/lib/onboarding-scene";
import { cn } from "@/lib/utils";

const TONE: Record<MockTone, string> = {
  primary: "bg-primary/15 text-primary",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

const PIN: Record<MockTone, string> = {
  primary: "bg-primary",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
  muted: "bg-muted-foreground/60",
};

const PHOTO_HUES = [
  "from-orange-300 to-rose-400",
  "from-sky-300 to-indigo-400",
  "from-emerald-300 to-teal-400",
  "from-amber-200 to-orange-400",
  "from-violet-300 to-fuchsia-400",
  "from-cyan-200 to-sky-400",
];

function Block({ b, pressedId }: { b: MockBlock; pressedId: string | null }) {
  const hit = (id?: string) => (id && id === pressedId ? "ring-2 ring-primary/60 scale-[0.97]" : "");
  const dataId = (id?: string) => (id ? { "data-mock-id": id } : {});

  switch (b.k) {
    case "title":
      return (
        <div className="flex items-center justify-between gap-2 px-0.5" {...dataId(b.id)}>
          <span className="truncate text-[11px] font-bold">{b.text}</span>
          {b.right && (
            <span
              className={cn(
                "shrink-0 text-[9px] font-semibold text-muted-foreground transition-transform",
                b.right === "?" && "grid size-5 place-items-center rounded-full bg-primary/15 text-[11px] text-primary",
                hit(b.id)
              )}
            >
              {b.right}
            </span>
          )}
        </div>
      );
    case "row":
      return (
        <div
          className={cn("flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 transition-transform", hit(b.id))}
          {...dataId(b.id)}
        >
          {b.done ? (
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">✓</span>
          ) : b.icon ? (
            <span className="w-4 shrink-0 text-center text-[13px] leading-none">{b.icon}</span>
          ) : (
            <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className={cn("truncate text-[11px] font-medium", b.done && "text-muted-foreground")}>{b.text}</div>
            {b.sub && <div className="truncate text-[9px] text-muted-foreground">{b.sub}</div>}
          </div>
          {b.badge && (
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold", TONE[b.tone ?? "muted"])}>{b.badge}</span>
          )}
        </div>
      );
    case "btn":
      return (
        <div
          className={cn(
            "rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold transition-transform",
            b.ghost
              ? "border border-border bg-card"
              : b.tone && b.tone !== "primary"
                ? TONE[b.tone]
                : "bg-primary text-primary-foreground shadow-sm shadow-primary/30",
            b.ghost && b.tone && b.tone !== "primary" && TONE[b.tone],
            hit(b.id)
          )}
          {...dataId(b.id)}
        >
          {b.text}
        </div>
      );
    case "chips":
      return (
        <div className={cn("flex flex-wrap gap-1 transition-transform", hit(b.id))} {...dataId(b.id)}>
          {b.items.map((c) => (
            <span
              key={c.text}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                c.on ? "bg-primary text-primary-foreground" : "border border-border bg-card"
              )}
            >
              {c.text}
            </span>
          ))}
        </div>
      );
    case "meter":
      return (
        <div className={cn("space-y-1 px-0.5 transition-transform", hit(b.id))} {...dataId(b.id)}>
          <div className="flex items-center justify-between text-[10px] font-medium">
            <span>{b.text}</span>
            {b.right && <span className="text-muted-foreground">{b.right}</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", PIN[b.tone ?? "primary"])}
              style={{ width: `${Math.round(Math.min(1, Math.max(0, b.value)) * 100)}%` }}
            />
          </div>
        </div>
      );
    case "map":
      return (
        <div
          className={cn("relative h-[76px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted/60 transition-transform", hit(b.id))}
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          {...dataId(b.id)}
        >
          {b.route && b.pins.length > 1 && (
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline
                points={b.pins.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1.6"
                strokeDasharray="3 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {b.pins.map((p, i) => (
            <span
              key={i}
              className={cn(
                "absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow",
                PIN[p.tone ?? (p.done ? "green" : "muted")]
              )}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            />
          ))}
        </div>
      );
    case "msg":
      return (
        <div
          className={cn(
            "max-w-[75%] rounded-xl px-2.5 py-1.5 text-[11px] transition-transform",
            b.me ? "ml-auto rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-card",
            hit(b.id)
          )}
          {...dataId(b.id)}
        >
          {b.text}
        </div>
      );
    case "photos":
      return (
        <div className={cn("grid grid-cols-6 gap-1 transition-transform", hit(b.id))} {...dataId(b.id)}>
          {Array.from({ length: Math.min(6, b.count) }).map((_, i) => (
            <span key={i} className={cn("h-9 rounded-md bg-gradient-to-br", PHOTO_HUES[i % PHOTO_HUES.length])} />
          ))}
        </div>
      );
    case "stats":
      return (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${b.items.length}, minmax(0, 1fr))` }} {...dataId(b.id)}>
          {b.items.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card px-2 py-1.5 leading-tight">
              <div className="text-[9px] text-muted-foreground">{s.label}</div>
              <div className={cn("text-[13px] font-bold", s.tone === "green" && "text-emerald-600 dark:text-emerald-400", s.tone === "red" && "text-rose-600 dark:text-rose-400")}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      );
    case "field":
      return (
        <div
          className={cn("rounded-lg border border-input bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition-transform", hit(b.id))}
          {...dataId(b.id)}
        >
          {b.text}
        </div>
      );
    case "tabs":
      return (
        <div className="flex gap-0.5 overflow-hidden rounded-lg border border-border bg-card p-0.5" {...dataId(b.id)}>
          {b.items.map((t, i) => (
            <span key={t} className="flex items-center gap-0.5">
              {b.groups?.includes(i) && <span className="mr-0.5 h-3.5 w-px bg-border" />}
              <span
                data-mock-id={`${b.id}${i}`}
                className={cn(
                  "whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-medium transition-transform",
                  i === b.on ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  hit(`${b.id}${i}`)
                )}
              >
                {t}
              </span>
            </span>
          ))}
        </div>
      );
    case "fab":
      return null; // рисуется отдельно, поверх экрана
    case "code":
      return (
        <div className="flex justify-center" {...dataId(b.id)}>
          <span className="rounded-full border border-dashed border-primary/50 bg-primary/10 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
            {b.text}
          </span>
        </div>
      );
    case "people":
      return (
        <div className="flex items-center -space-x-1.5" {...dataId(b.id)}>
          {b.items.map((e) => (
            <span key={e} className="grid size-7 place-items-center rounded-full border-2 border-card bg-secondary text-[13px]">
              {e}
            </span>
          ))}
        </div>
      );
    case "note":
      return (
        <div className={cn("rounded-lg px-2.5 py-1.5 text-[10px] font-medium leading-snug", TONE[b.tone ?? "muted"])} {...dataId(b.id)}>
          {b.text}
        </div>
      );
  }
}

function Fab({ pressed, id }: { pressed: boolean; id?: string }) {
  return (
    <span
      data-mock-id={id}
      className={cn(
        "absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-lg font-bold text-white shadow-lg shadow-orange-500/40 transition-transform",
        pressed && "scale-90 ring-2 ring-primary/60"
      )}
    >
      +
    </span>
  );
}

/** Статичный кадр макета (используется и анимацией, и reduced motion) */
export function MockScreen({ blocks, pressedId = null }: { blocks: MockBlock[]; pressedId?: string | null }) {
  const fab = blocks.find((b): b is Extract<MockBlock, { k: "fab" }> => b.k === "fab");
  return (
    <div className="relative size-full">
      <div className="absolute inset-x-3 inset-y-2.5 flex flex-col justify-center gap-1.5">
        {blocks.filter((b) => b.k !== "fab").map((b, i) => (
          <motion.div
            key={`${b.k}-${i}`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(i, 3) * 0.04 }}
          >
            <Block b={b} pressedId={pressedId} />
          </motion.div>
        ))}
      </div>
      {fab && <Fab id={fab.id} pressed={!!fab.id && fab.id === pressedId} />}
    </div>
  );
}

type Phase = "rest" | "move" | "press" | "result";

const REST_MS = 1100;
const MOVE_MS = 800;
const PRESS_MS = 260;
const RESULT_MS = 2600;

/**
 * Анимированный макет шага. Цикл: пауза → курсор едет к цели → нажатие → результат → заново.
 * Без tap — статичный кадр; при reduced motion сразу показывается результат без курсора.
 */
export function MockStage({ scene }: { scene: MockScene }) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("rest");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [home, setHome] = useState<{ x: number; y: number } | null>(null);
  const animated = !!scene.tap && !reduced;

  // Цикл фаз
  useEffect(() => {
    if (!animated) return;
    const next: Record<Phase, [Phase, number]> = {
      rest: ["move", REST_MS],
      move: ["press", MOVE_MS],
      press: ["result", PRESS_MS],
      result: ["rest", RESULT_MS],
    };
    const [to, ms] = next[phase];
    const t = window.setTimeout(() => setPhase(to), ms);
    return () => window.clearTimeout(t);
  }, [phase, animated]);

  // Куда ехать: центр цели в координатах рамки. Меряем на «rest», пока экран в исходном виде
  useLayoutEffect(() => {
    if (!animated || phase !== "rest") return;
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`[data-mock-id="${scene.tap}"]`);
    if (!root || !el) return;
    const r = root.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    const x = e.left - r.left + Math.min(e.width * 0.6, e.width - 6);
    const y = e.top - r.top + e.height * 0.55;
    setCursor({ x, y });
    setHome({ x: Math.min(r.width - 18, x + 56), y: Math.min(r.height - 14, y + 46) });
  }, [animated, phase, scene.tap]);

  if (!animated) {
    const blocks = scene.then && reduced ? (scene.thenMode === "replace" ? scene.then : [...scene.blocks, ...scene.then]) : scene.blocks;
    return (
      <div ref={rootRef} className="size-full">
        <MockScreen blocks={blocks} pressedId={reduced ? (scene.tap ?? null) : null} />
      </div>
    );
  }

  const done = phase === "press" || phase === "result";
  const blocks =
    done && scene.then ? (scene.thenMode === "replace" ? scene.then : [...scene.blocks, ...scene.then]) : scene.blocks;
  const target = phase === "rest" ? home : cursor;

  return (
    <div ref={rootRef} className="relative size-full">
      <MockScreen blocks={blocks} pressedId={phase === "press" ? (scene.tap ?? null) : null} />
      {target && (
        <motion.svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-0 top-0 size-5 drop-shadow-md"
          initial={false}
          animate={{
            x: target.x - 4,
            y: target.y - 2,
            opacity: phase === "result" ? 0 : 1,
            scale: phase === "press" ? 0.82 : 1,
          }}
          transition={{
            x: { duration: phase === "move" ? MOVE_MS / 1000 : 0, ease: "easeInOut" },
            y: { duration: phase === "move" ? MOVE_MS / 1000 : 0, ease: "easeInOut" },
            opacity: { duration: 0.25 },
            scale: { duration: 0.12 },
          }}
        >
          <path d="M5 3l14 8-6.2 1.6L9.8 19 5 3z" fill="white" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
        </motion.svg>
      )}
    </div>
  );
}
