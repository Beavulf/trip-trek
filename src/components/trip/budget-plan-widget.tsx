"use client";

import { useBudgetPlan, useUpdateBudgetPlan, useExpenses } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { motion } from "framer-motion";
import { Target, Pencil, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function BudgetPlanWidget() {
  const { data: plans, isLoading } = useBudgetPlan();
  const { data: expenses } = useExpenses();
  const update = useUpdateBudgetPlan();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  if (isLoading || !plans) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Загрузка плана…
      </div>
    );
  }

  // Расходы по категориям
  const spentByCat: Record<string, number> = {};
  expenses?.forEach((e) => {
    spentByCat[e.category] = (spentByCat[e.category] ?? 0) + e.amount;
  });

  const allCats = Object.keys(EXPENSE_CATEGORIES);
  const totalPlan = plans.reduce((s, p) => s + p.amount, 0);
  const totalSpent = expenses?.reduce((s, e) => s + e.amount, 0) ?? 0;

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
          План: ${totalPlan} · Потрачено: ${totalSpent.toFixed(0)}
        </div>
      </div>

      <div className="space-y-2.5">
        {allCats.map((cat) => {
          const meta = EXPENSE_CATEGORIES[cat];
          const plan = plans.find((p) => p.category === cat)?.amount ?? 0;
          const spent = spentByCat[cat] ?? 0;
          const pct = plan > 0 ? Math.min(100, (spent / plan) * 100) : 0;
          const over = spent > plan && plan > 0;
          const isEditing = editingCat === cat;

          return (
            <div key={cat} className="group">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{meta.emoji}</span>
                <span className="text-xs font-medium flex-1">{meta.label}</span>
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
                      className="w-20 min-h-[36px] text-xs rounded border border-input bg-background px-2 py-1 text-right"
                    />
                    <button
                      onClick={() => saveEdit(cat)}
                      className="size-9 rounded bg-primary text-primary-foreground grid place-items-center shrink-0 active:scale-95 transition-transform"
                      title="Сохранить"
                      aria-label="Сохранить"
                    >
                      <Check className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditVal(String(plan)); setEditingCat(cat); }}
                    className="min-h-[36px] px-2 -mx-2 rounded-md text-xs font-semibold hover:bg-accent flex items-center gap-1 active:scale-95 transition-transform"
                    aria-label={`Изменить план для категории ${meta.label}`}
                  >
                    <span>${plan}</span>
                    <Pencil className="size-3 text-muted-foreground" />
                  </button>
                )}
                <span className={cn("text-xs", over ? "text-red-500 font-semibold" : "text-muted-foreground")}>
                  / ${spent.toFixed(0)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
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
              {over && (
                <div className="text-[10px] text-red-500 mt-0.5">
                  Перерасход на ${(spent - plan).toFixed(0)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        ✏️ Тапни по сумме, чтобы изменить план
      </p>
      <p className="text-[10px] text-muted-foreground/70 mt-1 text-center">
        Зелёный — норма, жёлтый — близко к лимиту, красный — перерасход
      </p>
    </div>
  );
}
