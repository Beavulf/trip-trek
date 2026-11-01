"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { useUpdateBudgetPlan } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { moneyWhole } from "@/lib/budget/format";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

interface CategoryPlanSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ручная часть плана по категориям */
  manualBy: Record<string, number>;
  /** Часть из бюджетов мест маршрута: считается сама */
  routeBy: Record<string, number>;
  tripBudget: number;
  sym: string;
}

const KEYS = Object.keys(EXPENSE_CATEGORIES);

// Правка плана вынесена в окно: карандаш на каждой строке превращал отчёт о тратах в форму.
// Здесь же видно, из чего сложился план: ручная часть + суммы из мест маршрута.
export function CategoryPlanSheet({ open, onOpenChange, manualBy, routeBy, tripBudget, sym }: CategoryPlanSheetProps) {
  const update = useUpdateBudgetPlan();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Инициализация при открытии: пока окно закрыто, realtime-правки друзей не сбивают поля
  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries(KEYS.map((k) => [k, manualBy[k] ? String(manualBy[k]) : ""])));
    setConfirmingReset(false);
  }, [open, manualBy]);

  const manualOf = (k: string) => parseFloat(draft[k] ?? "") || 0;
  const total = KEYS.reduce((s, k) => s + manualOf(k) + (routeBy[k] ?? 0), 0);
  const hasManual = KEYS.some((k) => (manualBy[k] ?? 0) > 0);
  const hasRoute = KEYS.some((k) => (routeBy[k] ?? 0) > 0);

  const applyAll = async (next: (k: string) => number) => {
    const changed = KEYS.filter((k) => next(k) !== (manualBy[k] ?? 0));
    setSaving(true);
    const results = await Promise.allSettled(changed.map((category) => update.mutateAsync({ category, amount: next(category) })));
    setSaving(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`Не удалось сохранить ${failed} из ${changed.length}`);
      return;
    }
    toast.success("План обновлён");
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="План по категориям"
      titleIcon={<Target className="size-4" />}
      role="dialog"
      ariaLabel="План по категориям"
    >
      <div className="space-y-3">
        <p className="text-xs text-pretty text-muted-foreground">
          {hasRoute
            ? "Суммы из мест маршрута считаются сами. Здесь задаётся то, что к ним добавить."
            : "Сколько планируете потратить на каждую категорию."}
        </p>

        <ul className="space-y-1.5">
          {KEYS.map((k) => {
            const meta = EXPENSE_CATEGORIES[k];
            const fromRoute = routeBy[k] ?? 0;
            return (
              <li key={k} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                <span className="text-lg" aria-hidden="true">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`plan-${k}`} className="block truncate text-sm font-medium">{meta.label}</label>
                  {fromRoute > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">из маршрута {moneyWhole(sym, fromRoute)}</div>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-sm text-muted-foreground">{fromRoute > 0 ? `+ ${sym}` : sym}</span>
                  <input
                    id={`plan-${k}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft[k] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    placeholder="0"
                    className="input-mobile min-h-11 w-24 rounded-xl border border-input bg-background px-2 py-2 text-right text-base tabular-nums"
                  />
                </span>
              </li>
            );
          })}
        </ul>

        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Итого по плану</span>
            <span className="text-lg font-bold tabular-nums text-primary">{moneyWhole(sym, total)}</span>
          </div>
          {tripBudget > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              Бюджет поездки {moneyWhole(sym, tripBudget)}
              {total > tripBudget ? `, план больше на ${moneyWhole(sym, total - tripBudget)}` : ""}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => applyAll(manualOf)}
          disabled={saving}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {saving ? "Сохраняем…" : "Сохранить план"}
        </button>

        {/* Сброс живёт здесь, а не на странице: нужен редко и стирает ручные суммы */}
        {hasManual && hasRoute && (
          confirmingReset ? (
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2">
              <span className="min-w-0 flex-1 px-1 text-xs text-pretty text-muted-foreground">
                Ручные суммы удалятся, план станет равен суммам из мест маршрута.
              </span>
              <button type="button" onClick={() => applyAll(() => 0)} disabled={saving} className="btn-confirm-yes shrink-0">
                Сбросить
              </button>
              <button type="button" onClick={() => setConfirmingReset(false)} disabled={saving} className="btn-confirm-no shrink-0">
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="min-h-11 w-full rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              К плану маршрута
            </button>
          )
        )}
      </div>
    </MobileBottomSheet>
  );
}
