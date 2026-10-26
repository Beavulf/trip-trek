"use client";

// Вкладка «Обновления» в окне колокольчика: список записей и открытая запись с демо.
// Демо — те же анимированные макеты, что в обучении (MockStage): человек сам листает экраны
// и видит, как работает новая функция, а кнопка «Попробовать» ведёт прямо в неё.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { MockStage } from "@/components/trip/onboarding/mock-scene";
import type { UpdateItem } from "@/hooks/use-updates";
import { formatUpdateDate, actionAllowed, type UpdatesScope } from "@/lib/updates";
import { UPDATE_KIND_LABEL, type UpdateEntry } from "@/lib/updates-content";
import type { TourRole } from "@/lib/onboarding-content";
import { cn } from "@/lib/utils";

function KindChip({ kind }: { kind: UpdateEntry["kind"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        kind === "new" ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {UPDATE_KIND_LABEL[kind]}
    </span>
  );
}

export function UpdatesList({ items, onOpen }: { items: UpdateItem[]; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <div className="space-y-2 px-6 py-14 text-center">
        <div className="text-4xl">✨</div>
        <p className="text-sm font-medium">Пока без новостей</p>
        <p className="text-xs text-muted-foreground">Когда в приложении появится что-то новое, это будет здесь.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map(({ entry, unread }) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => onOpen(entry.id)}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 active:bg-accent/60",
              unread && "bg-primary/5"
            )}
          >
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl leading-none" aria-hidden>
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-2">
                <span className="text-sm font-semibold leading-snug">{entry.title}</span>
                {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Не прочитано" />}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{entry.summary}</span>
              <span className="mt-1.5 flex items-center gap-2">
                <KindChip kind={entry.kind} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  {formatUpdateDate(entry.date)}
                </span>
              </span>
            </span>
            <ChevronRight className="mt-3 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Демо записи: макет экрана, переключатель шагов и подпись. Касание макета запускает показ заново */
function UpdateDemo({ steps }: { steps: UpdateEntry["demo"] }) {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div>
      <div className="relative h-48 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${step}-${run}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <MockStage scene={current.scene} />
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          aria-label="Показать ещё раз"
          title="Показать ещё раз"
          className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground active:scale-90"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <p className="mt-2.5 min-h-10 text-center text-[13px] font-medium leading-snug" aria-live="polite">
        {current.caption}
      </p>

      {steps.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1.5" role="tablist" aria-label="Шаги демо">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Шаг ${i + 1}: ${s.caption}`}
              onClick={() => {
                setStep(i);
                setRun(0);
              }}
              className={cn(
                "grid size-8 place-items-center rounded-full text-xs font-bold tabular-nums transition-colors",
                i === step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UpdateDetail({
  entry,
  scope,
  role,
  onMarkRead,
  onAction,
  onTour,
}: {
  entry: UpdateEntry;
  scope: UpdatesScope;
  role: TourRole | null;
  onMarkRead: (id: string) => void;
  onAction: (action: NonNullable<UpdateEntry["action"]>["do"]) => void;
  onTour: (tourId: string) => void;
}) {
  // Открыл запись — прочитана
  useEffect(() => {
    onMarkRead(entry.id);
  }, [entry.id, onMarkRead]);

  const action = entry.action && actionAllowed(entry.action.do, role, scope) ? entry.action : null;

  return (
    <article className="space-y-4 px-4 pb-5 pt-4">
      <UpdateDemo steps={entry.demo} />

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <KindChip kind={entry.kind} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">{formatUpdateDate(entry.date)}</span>
          {entry.audience && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{entry.audience}</span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-bold leading-tight tracking-tight">{entry.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{entry.lead}</p>
      </div>

      <ul className="space-y-2">
        {entry.points.map((p) => (
          <li key={p.title} className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-lg leading-none" aria-hidden>
              {p.icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-snug">{p.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>

      {(action || entry.tour) && (
        <div className="space-y-2">
          {action && (
            <button
              type="button"
              onClick={() => onAction(action.do)}
              className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              {action.label}
            </button>
          )}
          {entry.tour && (
            <button
              type="button"
              onClick={() => onTour(entry.tour!.id)}
              className="min-h-11 w-full rounded-xl border border-border bg-secondary px-4 text-sm font-medium transition-colors hover:bg-accent active:scale-[0.98]"
            >
              {entry.tour.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
