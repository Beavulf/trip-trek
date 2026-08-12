"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateMember, getTripId } from "@/hooks/use-trip";
import type { Participant } from "@/lib/types";

interface ParticipantBudgetRowProps {
  participant: Participant;
  spent: number;
}

export function ParticipantBudgetRow({ participant, spent }: ParticipantBudgetRowProps) {
  const update = useUpdateMember();
  const tripId = getTripId();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(participant.budget?.toString() ?? "");

  const budget = participant.budget;
  const remaining = budget !== null ? budget - spent : null;
  const pct = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : null;

  const save = () => {
    const num = val.trim() ? parseFloat(val) : null;
    if (num === participant.budget) {
      // Ничего не изменилось — просто выходим из режима редактирования
      setEditing(false);
      return;
    }
    // P1 #7: toast только в onSuccess/onError — не показываем фейковый success
    update.mutate(
      { memberId: participant.id, tripId, budget: num },
      {
        onSuccess: () => {
          toast.success("Бюджет обновлён");
          setEditing(false);
        },
        onError: (err) => {
          toast.error("Не удалось сохранить", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
          // Возвращаем старое значение
          setVal(participant.budget?.toString() ?? "");
          setEditing(false);
        },
      }
    );
  };

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50">
      <div className="size-8 rounded-full grid place-items-center text-sm shrink-0" style={{ background: participant.color }}>
        {participant.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{participant.name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">потратил ${spent.toFixed(2)}</div>
        {pct !== null && (
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden max-w-[120px]">
            <div
              className={cn("h-full rounded-full", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            onBlur={save}
            autoFocus
            placeholder="—"
            className="w-24 min-h-11 text-base input-mobile rounded-xl border border-input bg-background px-2 py-2 text-right"
          />
        </div>
      ) : (
        <button
          onClick={() => { setVal(participant.budget?.toString() ?? ""); setEditing(true); }}
          className="text-right group"
        >
          <div className={cn("text-sm font-semibold", remaining !== null && remaining < 0 && "text-red-500")}>
            {budget !== null ? `$${budget}` : "—"}
          </div>
          {remaining !== null && (
            <div className={cn("text-[10px] tabular-nums", remaining < 0 ? "text-red-500" : "text-muted-foreground")}>
              ост. ${remaining.toFixed(2)}
            </div>
          )}
          <Pencil className="size-2.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors inline-block ml-1" />
        </button>
      )}
    </div>
  );
}
