"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateTripBudget } from "@/hooks/use-trip";

interface BudgetHeroProps {
  totalSpent: number;
  totalBudget: number;
  budgetPct: number;
  remaining: number;
  currencySymbol?: string;
}

export function BudgetHero({
  totalSpent,
  totalBudget,
  budgetPct,
  remaining,
  currencySymbol: sym = "$",
}: BudgetHeroProps) {
  const update = useUpdateTripBudget();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(totalBudget));

  const save = () => {
    if (update.isPending) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      toast.error("Введите корректную сумму");
      return;
    }
    update.mutate(num, {
      onSuccess: () => {
        toast.success("Бюджет обновлён");
        setEditing(false);
      },
      onError: (err) => {
        toast.error("Не удалось обновить бюджет", {
          description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        });
      },
    });
  };

  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
      <div className="absolute -bottom-6 -right-4 text-[100px] opacity-10 select-none">💰</div>
      <div className="relative">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Wallet className="size-4" /> Бюджет поездки
          {!editing && (
            <button
              type="button"
              onClick={() => { setVal(String(totalBudget)); setEditing(true); }}
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
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={() => { if (!update.isPending) save(); }}
                autoFocus
                className="w-24 text-2xl font-bold bg-white/15 rounded-lg px-2 py-0.5 outline-none placeholder:text-white/50"
                placeholder="1100"
              />
              <button type="button" onClick={save} disabled={update.isPending} className="size-11 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center disabled:opacity-50">
                <Check className="size-4" />
              </button>
              <button type="button" onClick={() => setEditing(false)} className="size-11 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <span className="text-white/80 mb-1 font-semibold">{sym}{totalBudget}</span>
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
      </div>
    </div>
  );
}
