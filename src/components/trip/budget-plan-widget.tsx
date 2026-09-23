"use client";

import { useMemo } from "react";
import { useBudgetPlan, useUpdateBudgetPlan, useExpenses, useTrip, useRouteDays } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { calculateRoutePlanByExpenseCategory } from "@/lib/budget";
import { currencySymbol } from "@/lib/currencies";
import { motion } from "framer-motion";
import { Target, Pencil, Check, Loader2, X, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn, plural, fmtMoney } from "@/lib/utils";

export function BudgetPlanWidget() {
  const { data: trip } = useTrip();
  const { data: plans, isLoading } = useBudgetPlan();
  // План маршрута: бюджеты мест (Place.budget) автоматически попадают в те же
  // категории трат. Ручной план (BudgetPlan) остаётся отдельным слагаемым.
  const { data: days, isLoading: routeLoading } = useRouteDays();
  const { data: expenses } = useExpenses();
  const update = useUpdateBudgetPlan();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showRest, setShowRest] = useState(false);
  const sym = currencySymbol(trip?.settings.currency);

  const routePlan = useMemo(
    () => calculateRoutePlanByExpenseCategory(days ?? []),
    [days]
  );

  // «Синхронизировать с маршрутом»: сбрасываем ручные правки плана в 0,
  // чтобы план снова был ровно тем, что размечено в местах маршрута.
  const [confirmingSync, setConfirmingSync] = useState(false);
  const hasManualPlans = plans?.some((p) => p.amount > 0) ?? false;
  const syncWithRoute = async () => {
    const rows = (plans ?? []).filter((p) => p.amount > 0);
    try {
      await Promise.all(rows.map((p) => update.mutateAsync({ category: p.category, amount: 0 })));
      toast.success("План синхронизирован с маршрутом", {
        description: "Ручные правки сброшены — план теперь из бюджетов мест",
      });
    } catch {
      toast.error("Не удалось синхронизировать план");
    }
    setConfirmingSync(false);
  };

  if (isLoading || routeLoading || !plans) {
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
  const manualPlanOf = (cat: string) => plans.find((p) => p.category === cat)?.amount ?? 0;
  const planOf = (cat: string) => manualPlanOf(cat) + (routePlan[cat] ?? 0); // полный план = вручную + маршрут
  const totalPlan = allCats.reduce((s, cat) => s + planOf(cat), 0);
  const routeTotal = Object.values(routePlan).reduce((s, v) => s + v, 0);
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);

  // По умолчанию показываем только категории с планом (включая маршрутный) или тратами — остальные за кнопкой
  const relevantCats = allCats.filter((cat) => planOf(cat) > 0 || (spentByCat[cat] ?? 0) > 0);
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
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Target className="size-4" /> План vs Факт
        </h2>
        {/* Возврат к плану маршрута: появляется, только когда есть ручные правки */}
        {hasManualPlans && !confirmingSync && (
          <button
            type="button"
            onClick={() => setConfirmingSync(true)}
            className="shrink-0 min-h-9 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground border border-border hover:text-foreground hover:bg-accent flex items-center gap-1 transition-colors active:scale-95"
            title="Сбросить ручные правки — план станет равен суммам из мест маршрута"
          >
            <RefreshCw className="size-3" /> К плану маршрута
          </button>
        )}
        {confirmingSync && (
          <div className="shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={syncWithRoute}
              disabled={update.isPending}
              className="btn-confirm-yes text-[11px]"
            >
              {update.isPending ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Сбрасываем…
                </>
              ) : (
                "Сбросить ручные"
              )}
            </button>
            <button type="button" onClick={() => setConfirmingSync(false)} className="btn-confirm-no text-[11px]">
              Отмена
            </button>
          </div>
        )}
        <div className="text-xs text-muted-foreground text-right">
          План: {sym}{fmtMoney(totalPlan)}{routeTotal > 0 ? ` (из маршрута ${sym}${fmtMoney(routeTotal)})` : ""} · Потрачено: {sym}{totalSpent.toFixed(0)}
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleCats.map((cat) => {
          const meta = EXPENSE_CATEGORIES[cat];
          const manual = manualPlanOf(cat);
          const fromRoute = routePlan[cat] ?? 0;
          const plan = manual + fromRoute;
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
                  /* Полный план (вручную + маршрут) — как редактируемое поле;
                     правится только ручная часть, маршрутная подставляется сама */
                  <button
                    onClick={() => { setEditVal(String(manual)); setEditingCat(cat); }}
                    className="min-h-11 flex items-center gap-1.5 rounded-xl border border-dashed border-foreground/25 bg-muted/70 hover:bg-accent px-3 active:scale-95 transition-transform"
                    aria-label={`Изменить ручной план для категории ${meta.label}${fromRoute > 0 ? `, из маршрута уже ${fmtMoney(fromRoute)}` : ""}`}
                    title={fromRoute > 0 ? `Правится только ручной план (${fmtMoney(manual)}); из маршрута ${fmtMoney(fromRoute)} подставляются сами` : "Изменить план"}
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
              <div className="flex justify-between mt-1 gap-2">
                {/* Брейкдаун плана: видим, какая часть пришла из маршрута, чтобы
                    правка ручной части не выглядела «сломанной» цифрой */}
                {fromRoute > 0 ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums truncate">
                    план: вручную {sym}{fmtMoney(manual)} · из маршрута {sym}{fmtMoney(fromRoute)}
                  </span>
                ) : <span />}
                <span className={cn("text-[11px] tabular-nums shrink-0", over ? "text-red-500 font-medium" : "text-muted-foreground")}>
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
