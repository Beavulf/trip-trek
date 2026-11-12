"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDeleteExpense, useTrip } from "@/hooks/use-trip";
import { isOptimisticExpenseId } from "@/hooks/trip/use-expenses";
import { useAuth } from "@/hooks/use-auth";
import { EXPENSE_CATEGORIES, type Expense, type Participant } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { moneyExact } from "@/lib/budget/format";
import { UserAvatar } from "../user-avatar";

interface ExpenseRowProps {
  expense: Expense;
  participants: Participant[];
}

// Строка — две линии: что и сколько, кто и как делили. Время, состав и удаление — по тапу на строку:
// корзина на каждой трате превращала список в ряд одинаковых опасных кнопок
export function ExpenseRow({ expense, participants }: ExpenseRowProps) {
  const { data: trip } = useTrip();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const myRole = participants.find((p) => p.id === currentUserId)?.role;

  const splitIds = expense.splitWith ? expense.splitWith.split(",").filter(Boolean) : [];
  const splitUsers = participants.filter((p) => splitIds.includes(p.id));
  const hasSplit = splitIds.length > 0;
  const excludeSelf = expense.excludeSelf;
  // Сколько человек делят трату; «За всех» — только если это вся группа (раньше писалось и для части группы)
  const sharers = excludeSelf ? splitIds.length : splitIds.length + 1;
  const selectableCount = participants.filter((p) => !p.former && p.role !== "viewer").length;
  const isSettlement = expense.category === "settlement";
  // Отменить ошибочную отметку «Перевели» может любая сторона перевода
  const isSettlementRecipient = isSettlement && splitIds.includes(currentUserId);
  // Оптимистичная запись (ещё не сохранена на сервере): удалить её нельзя, пока не придёт настоящая
  const saving = isOptimisticExpenseId(expense.id);
  const canDelete = !saving && (expense.paidById === currentUserId || myRole === "owner" || isSettlementRecipient);
  const sym = currencySymbol(trip?.settings.currency);
  const del = useDeleteExpense();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Категория вне справочника (старые данные) рисуется как «Прочее», а не «undefined22»
  const cat = EXPENSE_CATEGORIES[expense.category] ?? EXPENSE_CATEGORIES.other;
  const paidBy = participants.find((p) => p.id === expense.paidById);

  const when = new Date(expense.createdAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const splitShort = !hasSplit || isSettlement
    ? null
    : excludeSelf
      ? splitUsers.length > 0
        ? `за ${splitUsers.map((u) => u.name).join(", ")}`
        : `за ${splitIds.length} чел.`
      : sharers >= selectableCount
        ? "на всех"
        : `на ${sharers} чел.`;

  const original =
    expense.originalAmount != null && expense.originalCurrency && expense.originalCurrency !== trip?.settings.currency
      ? `${expense.originalAmount.toFixed(2).replace(".", ",")} ${expense.originalCurrency}`
      : null;

  const handleDelete = async () => {
    try {
      await del.mutateAsync(expense.id);
      setConfirming(false);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl transition-[background-color,opacity] duration-200",
        open ? "bg-accent/50" : "hover:bg-accent/40",
        isSettlement && !open && "bg-green-500/5",
        saving && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirming(false);
        }}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-2.5 rounded-xl p-2 text-left"
      >
        <span
          className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-base", isSettlement && "bg-green-600/15")}
          style={{ background: isSettlement ? undefined : `${cat.color}22` }}
          aria-hidden="true"
        >
          {isSettlement ? "💸" : cat.emoji}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{expense.description}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {paidBy && (
              <>
                <UserAvatar
                  name={paidBy.name}
                  emoji={paidBy.emoji}
                  color={paidBy.color}
                  avatarUrl={paidBy.avatarUrl}
                  className="size-3.5 shrink-0"
                  textClassName="text-[7px]"
                />
                <span className="max-w-24 shrink-0 truncate">{paidBy.name}</span>
                <span className="opacity-50" aria-hidden="true">·</span>
              </>
            )}
            <span className="truncate">
              {saving ? "сохраняется…" : isSettlement ? "перевод" : splitShort ?? cat.label.toLowerCase()}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end">
          <span className={cn("text-sm font-semibold tabular-nums", isSettlement && "font-medium text-muted-foreground")}>
            {moneyExact(sym, expense.amount)}
          </span>
          {original && <span className="text-xs text-muted-foreground tabular-nums">{original}</span>}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-2 pb-2 pl-[3.25rem]">
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <div>
                  {when}
                  {expense.day ? `, день ${expense.day.dayNumber}` : ""}
                </div>
                {!isSettlement && (
                  <div>
                    {cat.label}
                    {hasSplit && splitUsers.length > 0 && !excludeSelf ? `, вместе с ${splitUsers.map((u) => u.name).join(", ")}` : ""}
                    {!hasSplit ? ", личная трата" : ""}
                  </div>
                )}
              </div>
              {canDelete &&
                (confirming ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={del.isPending}
                      className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl bg-red-500 px-3 text-xs font-medium text-white"
                    >
                      {del.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Удалить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={del.isPending}
                      className="min-h-11 min-w-11 rounded-xl bg-secondary px-3 text-xs"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                    title="Удалить трату"
                    aria-label="Удалить трату"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
