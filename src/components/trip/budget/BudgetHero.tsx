"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Pencil, Check, X, Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { cn, plural, fmtMoney } from "@/lib/utils";
import { useUpdateTripBudget } from "@/hooks/use-trip";

interface BudgetHeroProps {
  totalSpent: number;
  totalBudget: number;
  budgetPct: number;
  remaining: number;
  currencySymbol?: string;
  /** Сколько дней поездки осталось (включая сегодня). null — темп не показываем */
  daysLeft?: number | null;
  onAddClick?: () => void;
}

export function BudgetHero({
  totalSpent,
  totalBudget,
  budgetPct,
  remaining,
  currencySymbol: sym = "$",
  daysLeft = null,
  onAddClick,
}: BudgetHeroProps) {
  const update = useUpdateTripBudget();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(totalBudget));
  // Почему поле закрылось: "cancel" — не сохранять, "save" — уже сохраняем.
  // Без него blur от клика по ✕ (или Escape) успевает вызвать save раньше onClick.
  const closeReason = useRef<"cancel" | "save" | null>(null);

  const openEditor = () => {
    closeReason.current = null;
    setVal(String(totalBudget));
    setEditing(true);
  };

  const save = () => {
    if (closeReason.current === "save" || update.isPending) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      toast.error("Введите корректную сумму");
      return;
    }
    closeReason.current = "save";
    update.mutate(num, {
      onSuccess: () => {
        toast.success("Бюджет обновлён");
        setEditing(false);
      },
      onError: (err) => {
        closeReason.current = null;
        toast.error("Не удалось обновить бюджет", {
          description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        });
      },
    });
  };

  const cancel = () => {
    closeReason.current = "cancel";
    setEditing(false);
  };

  const showPace = daysLeft !== null && daysLeft >= 1 && remaining > 0 && totalBudget > 0;

  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
      <div className="absolute -bottom-6 -right-4 text-[100px] opacity-10 select-none">💰</div>
      <div className="relative">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Wallet className="size-4" /> Бюджет поездки
          {!editing && (
            <button
              type="button"
              onClick={openEditor}
              className="ml-auto size-11 rounded-lg bg-white/15 hover:bg-white/25 grid place-items-center transition-colors"
              title="Изменить бюджет"
              aria-label="Изменить бюджет"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <span className="text-4xl font-bold tabular-nums">{sym}{totalSpent.toFixed(0)}</span>
          <span className="text-white/80 mb-1">/</span>
          {editing ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-white/80">{sym}</span>
              <input
                type="number"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") cancel();
                }}
                onBlur={() => {
                  // Флаг "cancel" одноразовый: если тап по ✕ сорвался и click не пришёл,
                  // следующий уход из поля снова должен сохранять
                  if (closeReason.current === "cancel") {
                    closeReason.current = null;
                    return;
                  }
                  save();
                }}
                autoFocus
                className="w-24 text-2xl font-bold bg-white/15 rounded-lg px-2 py-0.5 outline-none placeholder:text-white/50"
                placeholder="1100"
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={update.isPending} aria-label="Сохранить бюджет" className="size-11 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center disabled:opacity-50">
                <Check className="size-4" />
              </button>
              <button
                type="button"
                // pointerdown приходит раньше blur инпута — ставим флаг до того, как blur вызовет save
                onPointerDown={(e) => { e.preventDefault(); closeReason.current = "cancel"; }}
                onClick={cancel}
                aria-label="Отменить"
                className="size-11 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <span className="text-white/80 mb-1 font-semibold">{sym}{fmtMoney(totalBudget)}</span>
          )}
        </div>

        <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, budgetPct)}%` }}
            transition={{ duration: 0.8 }}
            className={cn("h-full rounded-full", budgetPct > 90 ? "bg-red-300" : "bg-white")}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-white/80">Потрачено {budgetPct.toFixed(0)}%</span>
          <span className={cn("font-semibold", remaining < 0 ? "text-red-200" : "text-white")}>
            {remaining >= 0
              ? `Остаток ${sym}${remaining.toFixed(0)}`
              : `Перерасход ${sym}${Math.abs(remaining).toFixed(0)}`}
          </span>
        </div>
        {showPace && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/80">
            <CalendarDays className="size-3.5 shrink-0" />
            <span>
              ≈ {sym}{Math.ceil(remaining / daysLeft!)} в день · ещё {daysLeft} {plural(daysLeft!, "день", "дня", "дней")}
            </span>
          </div>
        )}

        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            className="mt-3.5 w-full sm:w-auto sm:px-6 min-h-11 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            <Plus className="size-4" /> Добавить трату
          </button>
        )}
      </div>
    </div>
  );
}
