"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Circle, CircleCheck, MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useChecklist, useToggleChecklist, type ChecklistItem } from "@/hooks/use-trip";
import { checklistProgress, groupChecklist, type ChecklistGroup } from "@/lib/info-page";
import { daysBetween } from "@/lib/lodging";
import { tripRangeKeys } from "@/lib/trip-days";
import type { TripSummary } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { ChecklistItemSheet, type ChecklistSheetTarget } from "./ChecklistItemSheet";
import { ChecklistTemplatesSheet } from "./ChecklistTemplatesSheet";

interface ChecklistSectionProps {
  trip?: TripSummary;
  canEdit: boolean;
  today: string;
}

/** Где поездка сейчас: чек-лист до вылета и в дороге читается по-разному */
function phaseText(trip: TripSummary | undefined, today: string): string | null {
  if (!trip) return null;
  const { startKey, lastKey } = tripRangeKeys(trip.settings);
  const toStart = daysBetween(today, startKey);
  if (toStart > 0) return `До старта ${toStart} ${plural(toStart, "день", "дня", "дней")}`;
  if (today > lastKey) return "Поездка завершилась";
  return `Идёт день ${trip.currentDayNumber || 1} из ${trip.settings.totalDays}`;
}

export function ChecklistSection({ trip, canEdit, today }: ChecklistSectionProps) {
  const { data: items, isLoading, error, refetch } = useChecklist();
  const [sheet, setSheet] = useState<ChecklistSheetTarget | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const list = useMemo(() => items ?? [], [items]);
  const groups = useMemo(() => groupChecklist(list), [list]);
  const { total, done, pending, pct } = checklistProgress(list);

  // Однократное празднование: чек-лист только что стал полным
  const prevPct = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading || !items) return;
    if (prevPct.current !== null && prevPct.current < 100 && pct === 100) {
      toast.success("Всё готово! 🎉", { description: "Все пункты чек-листа выполнены" });
    }
    prevPct.current = pct;
  }, [pct, isLoading, items]);

  if (error && !items) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-destructive" aria-hidden="true" />
        <p className="text-sm">Не удалось загрузить чек-лист</p>
        <button type="button" onClick={() => refetch()} className="min-h-11 rounded-lg bg-primary px-3 text-xs text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading || !items) {
    return <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" />;
  }

  const phase = phaseText(trip, today);
  const title =
    total === 0 ? "Что не забыть в поездку" : pending > 0 ? `Осталось ${pending} ${plural(pending, "пункт", "пункта", "пунктов")}` : "Всё готово";

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3" aria-label="Сводка чек-листа">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">{title}</h2>
            {total > 0 && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{done} из {total}</span>}
          </div>
          {phase && <p className="mt-0.5 text-xs text-muted-foreground">{phase}</p>}
        </div>
        {total > 0 && (
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Готовность чек-листа"
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className={cn("h-full rounded-full transition-[width] duration-500", pending ? "bg-primary" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-xs text-pretty text-muted-foreground">
          {total === 0
            ? "Документы, лекарства, сборы туда и обратно. Начните с готовых наборов, потом добавьте своё."
            : "Список общий на всю поездку: отметки видят все участники."}
        </p>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSheet({ mode: "add", category: "preparation" })}
              className={cn(
                "min-h-11 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform",
                total === 0 ? "border border-border" : "bg-primary text-primary-foreground"
              )}
            >
              <Plus className="size-4" aria-hidden="true" /> Добавить
            </button>
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className={cn(
                "min-h-11 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform",
                total === 0 ? "bg-primary text-primary-foreground" : "border border-border"
              )}
            >
              <Sparkles className="size-4" aria-hidden="true" /> Шаблоны
            </button>
          </div>
        )}
      </section>

      {groups.map((g) => (
        <GroupCard
          key={g.cat}
          group={g}
          canEdit={canEdit}
          onEdit={(item) => setSheet({ mode: "edit", item })}
        />
      ))}

      {sheet && (
        <ChecklistItemSheet
          key={sheet.mode === "edit" ? sheet.item.id : `add-${sheet.category}`}
          target={sheet}
          onClose={() => setSheet(null)}
        />
      )}
      {templatesOpen && <ChecklistTemplatesSheet items={list} onClose={() => setTemplatesOpen(false)} />}
    </div>
  );
}

function GroupCard({
  group,
  canEdit,
  onEdit,
}: {
  group: ChecklistGroup;
  canEdit: boolean;
  onEdit: (item: ChecklistItem) => void;
}) {
  const complete = group.pending.length === 0;
  // Завершённая группа сворачивается сама: 30 зачёркнутых строк только мешали искать оставшееся
  const [override, setOverride] = useState<boolean | null>(null);
  const [showDone, setShowDone] = useState(false);
  const open = override ?? !complete;
  const doneCount = group.done.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={group.label}>
      <h3>
        <button
          type="button"
          onClick={() => setOverride(!open)}
          aria-expanded={open}
          className="flex min-h-12 w-full items-center gap-2.5 px-4 py-2 text-left"
        >
          <span aria-hidden="true">{group.emoji}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.label}</span>
          {complete && <Check className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{doneCount}/{group.total}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>

      {open && (
        <div className="border-t border-border/60 pb-1">
          {group.pending.map((item) => (
            <ChecklistRow key={item.id} item={item} canEdit={canEdit} onEdit={() => onEdit(item)} />
          ))}
          {doneCount > 0 && !complete && (
            <button
              type="button"
              onClick={() => setShowDone(!showDone)}
              aria-expanded={showDone}
              className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-xs text-muted-foreground hover:bg-accent/50"
            >
              <ChevronDown className={cn("size-5 shrink-0 transition-transform", showDone && "rotate-180")} aria-hidden="true" />
              Готово: {doneCount}
            </button>
          )}
          {(complete || showDone) &&
            group.done.map((item) => <ChecklistRow key={item.id} item={item} canEdit={canEdit} onEdit={() => onEdit(item)} />)}
        </div>
      )}
    </section>
  );
}

function ChecklistRow({ item, canEdit, onEdit }: { item: ChecklistItem; canEdit: boolean; onEdit: () => void }) {
  const toggle = useToggleChecklist();
  const Icon = item.done ? CircleCheck : Circle;
  const content = (
    <>
      <Icon className={cn("mt-0.5 size-5 shrink-0", item.done ? "text-emerald-500" : "text-muted-foreground")} aria-hidden="true" />
      <span className={cn("min-w-0 flex-1 text-sm text-pretty break-words", item.done && "text-muted-foreground line-through")}>{item.text}</span>
    </>
  );

  return (
    <div className="flex items-start">
      {canEdit ? (
        <button
          type="button"
          // Отмечает вся строка: попасть в маленький кружок на ходу трудно, а клик по тексту открывал правку
          onClick={() =>
            toggle.mutate(
              { id: item.id, done: !item.done },
              { onError: (e) => toast.error("Не удалось обновить", { description: e instanceof Error ? e.message : "" }) }
            )
          }
          role="checkbox"
          aria-checked={item.done}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-2.5 pl-4 pr-1 text-left active:bg-accent/50"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-2.5 pl-4 pr-4">{content}</div>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Изменить: ${item.text}`}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
