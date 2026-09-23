"use client";

import { useBudgetPlan, useUpdateBudgetPlan, useExpenses, useTrip } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { motion } from "framer-motion";
import { Target, Pencil, Check, Loader2, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn, plural, fmtMoney } from "@/lib/utils";

export function BudgetPlanWidget() {
  const { data: trip } = useTrip();
  const { data: plans, isLoading } = useBudgetPlan();
  const { data: expenses } = useExpenses();
  const update = useUpdateBudgetPlan();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showRest, setShowRest] = useState(false);
  const sym = currencySymbol(trip?.settings.currency);

  if (isLoading || !plans) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Загрузка плана…
      </div>
    );
  }

  // P1 #5: унифицированный фильтр реальных трат — settlement исключён
  const realExpenses = (expenses ?? []).filter((e) => e.category !== "settlement");

  // Расходы по категориям
  const spentByCat: Record<string, number> = {};
  realExpenses.forEach((e) => {
    spentByCat[e.category] = (spentByCat[e.category] ?? 0) + e.amount;
  });

  const allCats = Object.keys(EXPENSE_CATEGORIES);
  const totalPlan = plans.reduce((s, p) => s + p.amount, 0);
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);

  // По умолчанию показываем только категории с планом или тратами — остальные за кнопкой
  const relevantCats = allCats.filter((cat) => {
    const plan = plans.find((p) => p.category === cat)?.amount ?? 0;
    return plan > 0 || (spentByCat[cat] ?? 0) > 0;
  });
  const restCats = allCats.filter((cat) => !relevantCats.includes(cat));
  const visibleCats = relevantCats.length === 0 || showRest ? allCats : relevantCats;

  const saveEdit = (cat: string) => {
    const num = parseFloat(editVal);
    if (!isNaN(num) && num >= 0) {
      update.mutate(
        { category: cat, amount: num },
        {
          onSuccess: () => toast.success("План обновлён"),
          onError: () => toast.error("Не удалось сохранить"),
        }
      );
    } else {
      toast.error("Введите корректную сумму");
    }
    setEditingCat(null);
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Target className="size-4" /> План vs Факт
        </h2>
        <div className="text-xs text-muted-foreground">
          План: {sym}{fmtMoney(totalPlan)} · Потрачено: {sym}{totalSpent.toFixed(0)}
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleCats.map((cat) => {
          const meta = EXPENSE_CATEGORIES[cat];
          const plan = plans.find((p) => p.category === cat)?.amount ?? 0;
          const spent = spentByCat[cat] ?? 0;
          const pct = plan > 0 ? Math.min(100, (spent / plan) * 100) : 0;
          const over = spent > plan && plan > 0;
          const isEditing = editingCat === cat;

          return (
            <div key={cat} className="group">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base shrink-0">{meta.emoji}</span>
                <span className="text-sm font-medium flex-1 truncate">{meta.label}</span>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(cat);
                        if (e.key === "Escape") setEditingCat(null);
                      }}
                      autoFocus
                      className="w-20 min-h-11 text-sm rounded-lg border-2 border-primary bg-background px-2 py-1 text-right tabular-nums"
                    />
                    <button
                      onClick={() => saveEdit(cat)}
                      className="size-11 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0 active:scale-95 transition-transform"
                      title="Сохранить"
                      aria-label="Сохранить"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => setEditingCat(null)}
                      className="size-11 rounded-lg bg-secondary border border-border grid place-items-center shrink-0 active:scale-95 transition-transform"
                      title="Отменить"
                      aria-label="Отменить"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  /* План — как редактируемое поле: пилюля с пунктирной рамкой и карандашом */
                  <button
                    onClick={() => { setEditVal(String(plan)); setEditingCat(cat); }}
                    className="min-h-11 flex items-center gap-1.5 rounded-xl border border-dashed border-foreground/25 bg-muted/70 hover:bg-accent px-3 active:scale-95 transition-transform"
                    aria-label={`Изменить план для категории ${meta.label}`}
                  >
                    <Pencil className="size-3.5 text-primary shrink-0" />
                    <span className={cn("text-sm font-bold tabular-nums", over ? "text-red-600" : "text-foreground")}>
                      {sym}{fmtMoney(plan)}
                    </span>
                  </button>
                )}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                  className={cn(
                    "h-full rounded-full",
                    over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"
                  )}
                />
              </div>
              <div className="flex justify-end mt-1">
                <span className={cn("text-[11px] tabular-nums", over ? "text-red-500 font-medium" : "text-muted-foreground")}>
                  потрачено {sym}{spent.toFixed(0)}
                </span>
              </div>
              {over && (
                <div className="text-[11px] text-red-500 -mt-0.5 text-right font-medium">
                  Перерасход на {sym}{(spent - plan).toFixed(0)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {restCats.length > 0 && relevantCats.length > 0 && (
        <button
          type="button"
          onClick={() => setShowRest((v) => !v)}
          className="mt-3 w-full min-h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center justify-center gap-1 transition-colors"
        >
          {showRest ? "Скрыть категории без плана и трат" : `Ещё ${restCats.length} ${plural(restCats.length, "категория", "категории", "категорий")} без плана и трат`}
          <ChevronDown className={cn("size-3.5 transition-transform", showRest && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
