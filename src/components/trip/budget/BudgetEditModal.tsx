"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Users, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTrip, useUpdateMember, getTripId } from "@/hooks/use-trip";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

interface BudgetEditModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// Модалка настройки бюджетов участников
export function BudgetEditModal({ open, onOpenChange }: BudgetEditModalProps) {
  useBodyScrollLock(open);
  const { data: trip } = useTrip();
  const update = useUpdateMember();
  const tripId = getTripId();
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Инициализация при открытии
  useEffect(() => {
    if (open && trip?.participants) {
      const init: Record<string, string> = {};
      trip.participants.forEach((p) => { init[p.id] = p.budget?.toString() ?? ""; });
      setBudgets(init);
    }
  }, [open, trip]);

  if (!open || typeof document === "undefined" || !trip) return null;

  const total = Object.values(budgets).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // P1 #6: используем useUpdateMember hook + try/catch + проверяем r.ok на каждый PATCH.
  // Хук уже инвалидирует ["trip"] и ["budget-plan"] после успеха.
  const save = async () => {
    setSaving(true);
    let errors = 0;
    try {
      for (const p of trip.participants) {
        const val = budgets[p.id] ?? "";
        const num = val.trim() ? parseFloat(val) : null;
        // Сохраняем только то что изменилось
        if (num !== p.budget) {
          try {
            await update.mutateAsync({ memberId: p.id, tripId, budget: num });
          } catch {
            errors++;
          }
        }
      }
      if (errors > 0) {
        toast.error(`Не удалось сохранить ${errors} из ${trip.participants.length}`);
      } else {
        toast.success("Бюджеты обновлены! 💰");
        onOpenChange(false);
      }
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto"
        >
          {/* Handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Users className="size-4" /> Бюджеты участников
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-8 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Установи личный бюджет для каждого участника. Общий бюджет = сумма всех.
            </p>

            {/* Список участников */}
            {trip.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                <div className="size-10 rounded-full grid place-items-center text-lg shrink-0" style={{ background: p.color }}>
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.role && <div className="text-[10px] text-muted-foreground">{p.role}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={budgets[p.id] ?? ""}
                    onChange={(e) => setBudgets({ ...budgets, [p.id]: e.target.value })}
                    placeholder="—"
                    className="w-20 text-sm rounded-lg border border-input bg-background px-2 py-1.5 text-right"
                  />
                </div>
              </div>
            ))}

            {/* Итого */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-sm font-semibold">Общий бюджет:</span>
              <span className="text-lg font-bold text-primary">${total.toFixed(0)}</span>
            </div>

            {/* Кнопка сохранить */}
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
