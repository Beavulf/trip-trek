"use client";

import { useState, useEffect } from "react";
import { Users, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTrip, useUpdateMember, getTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { expenseSelectableParticipants } from "@/lib/budget";
import { currencySymbol } from "@/lib/currencies";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

interface BudgetEditModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// Модалка настройки бюджетов участников — на общем примитиве шита
// (раньше была ручная копия портала с ранним return null: exit-анимации не было)
export function BudgetEditModal({ open, onOpenChange }: BudgetEditModalProps) {
  const { data: trip } = useTrip();
  const update = useUpdateMember();
  const tripId = getTripId();
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  // Инициализация при открытии
  useEffect(() => {
    if (open && trip?.participants) {
      const init: Record<string, string> = {};
      trip.participants.forEach((p) => { init[p.id] = p.budget?.toString() ?? ""; });
      setBudgets(init);
    }
  }, [open, trip]);

  if (!trip) return null;

  const sym = currencySymbol(trip.settings.currency);
  // Зрители вне денег и общий бюджет не задают (так же считает сервер: /api/trip budgetSource).
  // Чужой бюджет правит только владелец — остальным чужие поля заблокированы, а не «403 из N»
  const budgetPeople = expenseSelectableParticipants(trip.participants);
  const myRole = trip.participants.find((p) => p.id === currentUserId)?.role;
  const canEditOf = (id: string) => id === currentUserId || myRole === "owner";
  const total = budgetPeople.reduce((s, p) => s + (parseFloat(budgets[p.id] ?? "") || 0), 0);

  // P1 #6: используем useUpdateMember hook + try/catch + проверяем r.ok на каждый PATCH.
  // Хук уже инвалидирует ["trip"] и ["budget-plan"] после успеха.
  const save = async () => {
    setSaving(true);
    let errors = 0;
    try {
      for (const p of budgetPeople) {
        if (!canEditOf(p.id)) continue;
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
        toast.error(`Не удалось сохранить ${errors} из ${budgetPeople.filter((p) => canEditOf(p.id)).length}`);
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

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Бюджеты участников"
      titleIcon={<Users className="size-4" />}
      role="dialog"
      ariaLabel="Бюджеты участников"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {myRole === "owner"
            ? "Установи личный бюджет для каждого участника. Общий бюджет = сумма всех."
            : "Свой бюджет правишь ты, чужие — владелец поездки. Общий бюджет = сумма всех."}
        </p>

        {/* Список участников */}
        {budgetPeople.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
            <div className="size-10 rounded-full grid place-items-center text-lg shrink-0" style={{ background: p.color }}>
              {p.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              {p.role && <div className="text-[10px] text-muted-foreground">{p.role}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm text-muted-foreground">{sym}</span>
              <input
                type="number"
                inputMode="decimal"
                value={budgets[p.id] ?? ""}
                onChange={(e) => setBudgets({ ...budgets, [p.id]: e.target.value })}
                disabled={!canEditOf(p.id)}
                placeholder="—"
                className="w-24 min-h-11 text-base input-mobile rounded-xl border border-input bg-background px-2 py-2 text-right disabled:opacity-60"
              />
            </div>
          </div>
        ))}

        {/* Итого */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
          <span className="text-sm font-semibold">Общий бюджет:</span>
          <span className="text-lg font-bold text-primary">{sym}{total.toFixed(0)}</span>
        </div>

        {/* Кнопка сохранить */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
