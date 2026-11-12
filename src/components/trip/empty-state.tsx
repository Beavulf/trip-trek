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
