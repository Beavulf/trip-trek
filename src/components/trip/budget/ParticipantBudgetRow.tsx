"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateMember, useTrip, getTripId } from "@/hooks/use-trip";
import { currencySymbol } from "@/lib/currencies";
import type { Participant } from "@/lib/types";
import { UserAvatar } from "../user-avatar";

interface ParticipantBudgetRowProps {
  participant: Participant;
  spent: number;
}

export function ParticipantBudgetRow({ participant, spent }: ParticipantBudgetRowProps) {
  const update = useUpdateMember();
  const tripId = getTripId();
  const { data: trip } = useTrip();
  const sym = currencySymbol(trip?.settings.currency);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(participant.budget?.toString() ?? "");
  // "cancel" — закрылись по Escape/отмене, blur не должен сохранять
  const closeRef = useRef<"cancel" | "save" | null>(null);

  const budget = participant.budget;
  const remaining = budget !== null ? budget - spent : null;
  const pct = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : null;

  const save = () => {
    if (closeRef.current === "save") return;
    const num = val.trim() ? parseFloat(val) : null;
    if (num === participant.budget) {
      // Ничего не изменилось — просто выходим из режима редактирования
      setEditing(false);
      return;
    }
    // P1 #7: toast только в onSuccess/onError — не показываем фейковый success
    closeRef.current = "save";
    update.mutate(
      { memberId: participant.id, tripId, budget: num },
      {
        onSuccess: () => {
          toast.success("Бюджет обновлён");
          setEditing(false);
        },
        onError: (err) => {
          closeRef.current = null;
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
      <UserAvatar
        name={participant.name}
        emoji={participant.emoji}
        color={participant.color}
        avatarUrl={participant.avatarUrl}
        className="size-8"
        textClassName="text-sm"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{participant.name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">потратил {sym}{spent.toFixed(2)}</div>
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
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { closeRef.current = "cancel"; setEditing(false); } }}
            onBlur={() => {
              if (closeRef.current === "cancel") {
                closeRef.current = null;
                return;
              }
              save();
            }}
            autoFocus
            placeholder="—"
            className="w-24 min-h-11 text-base input-mobile rounded-xl border border-input bg-background px-2 py-2 text-right"
          />
        </div>
      ) : (
        <button
          onClick={() => { closeRef.current = null; setVal(participant.budget?.toString() ?? ""); setEditing(true); }}
          className="text-right group"
        >
          <div className={cn("text-sm font-semibold", remaining !== null && remaining < 0 && "text-red-500")}>
            {budget !== null ? `${sym}${budget}` : "—"}
          </div>
          {remaining !== null && (
            <div className={cn("text-[10px] tabular-nums", remaining < 0 ? "text-red-500" : "text-muted-foreground")}>
              ост. {sym}{remaining.toFixed(2)}
            </div>
          )}
          <Pencil className="size-2.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors inline-block ml-1" />
        </button>
      )}
    </div>
  );
}
