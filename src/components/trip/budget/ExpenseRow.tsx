"use client";

import { useState } from "react";
import { Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDeleteExpense, useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { EXPENSE_CATEGORIES, type Expense, type Participant } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";

interface ExpenseRowProps {
  expense: Expense;
  participants: Participant[];
}

export function ExpenseRow({ expense, participants }: ExpenseRowProps) {
  const { data: trip } = useTrip();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const myRole = participants.find((p) => p.id === currentUserId)?.role;
  const canDelete = expense.paidById === currentUserId || myRole === "owner";
  const sym = currencySymbol(trip?.settings.currency);
  const del = useDeleteExpense();
  const [confirming, setConfirming] = useState(false);
  const isSettlement = expense.category === "settlement";
  const cat = EXPENSE_CATEGORIES[expense.category];
  const paidBy = participants.find((p) => p.id === expense.paidById);

  // Split info
  const splitIds = expense.splitWith ? expense.splitWith.split(",").filter(Boolean) : [];
  const splitUsers = participants.filter(p => splitIds.includes(p.id));
  const hasSplit = splitIds.length > 0;
  const excludeSelf = expense.excludeSelf;

  // Время
  const timeStr = new Date(expense.createdAt).toLocaleString("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const handleDelete = async () => {
    try {
      await del.mutateAsync(expense.id);
      toast.success("Удалено");
      setConfirming(false);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  return (
    <div className={cn(
      "flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-accent/50 transition-colors",
      isSettlement && "bg-green-500/5 border border-green-500/20"
    )}>
      {/* Иконка категории */}
      <div
        className={cn("size-9 rounded-xl grid place-items-center text-base shrink-0 mt-0.5", isSettlement ? "bg-green-600/15" : "")}
        style={{ background: isSettlement ? undefined : `${cat?.color}22` }}
      >
        {isSettlement ? "💸" : cat?.emoji}
      </div>

      {/* Контент */}
      <div className="min-w-0 flex-1">
        {/* Описание + сумма */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{expense.description}</span>
          <span className="font-semibold text-sm shrink-0 tabular-nums">{sym}{expense.amount.toFixed(2)}</span>
        </div>

        {/* Мета: кто заплатил + категория + день */}
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
          {paidBy && (
            <span className="flex items-center gap-0.5">
              <span className="size-3.5 rounded-full grid place-items-center text-[7px]" style={{ background: paidBy.color }}>{paidBy.emoji}</span>
              <span className="font-medium">{paidBy.name}</span>
            </span>
          )}
          <span className="opacity-50">·</span>
          <span>{isSettlement ? "Перевод" : cat?.label}</span>
          {expense.day && (
            <>
              <span className="opacity-50">·</span>
              <span>День {expense.day.dayNumber}</span>
            </>
          )}
        </div>

        {/* Split badge */}
        {hasSplit && !isSettlement && (
          <div className="mt-1.5 inline-flex items-center gap-1 bg-primary/8 rounded-md px-1.5 py-0.5 text-[10px]">
            <Users className="size-2.5 text-primary" />
            <span className="text-primary font-medium">
              {excludeSelf
                ? `За ${splitUsers.map(u => u.name).join(", ")}`
                : `За всех (${splitIds.length + 1} чел)`
              }
            </span>
          </div>
        )}

        {/* Время добавления */}
        <div className="text-[9px] text-muted-foreground/60 mt-1">{timeStr}</div>
      </div>

      {/* Удаление — только плательщик или owner */}
      {canDelete && (
      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={del.isPending}
              className="min-h-11 min-w-11 text-xs bg-red-500 text-white px-3 rounded-xl font-medium flex items-center justify-center gap-1"
            >
              {del.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {del.isPending ? "…" : "Да"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={del.isPending}
              className="min-h-11 min-w-11 text-xs bg-secondary px-3 rounded-xl"
            >
              Нет
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="size-11 rounded-xl hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-colors text-muted-foreground"
            title="Удалить"
            aria-label="Удалить трату"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      )}
    </div>
  );
}
