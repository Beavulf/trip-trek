"use client";

import { useState } from "react";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDeleteExpense } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES, type Expense, type Participant } from "@/lib/types";

interface ExpenseRowProps {
  expense: Expense;
  participants: Participant[];
}

export function ExpenseRow({ expense, participants }: ExpenseRowProps) {
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

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-accent/50 transition-colors">
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
          <span className="font-semibold text-sm shrink-0">${expense.amount.toFixed(2)}</span>
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

      {/* Удаление */}
      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { del.mutate(expense.id); toast.success("Удалено"); setConfirming(false); }}
              disabled={del.isPending}
              className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium"
            >
              {del.isPending ? "…" : "Да"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-[10px] bg-secondary px-2 py-1 rounded-lg">
              Нет
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="size-7 rounded-lg hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-colors text-muted-foreground"
            title="Удалить"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
