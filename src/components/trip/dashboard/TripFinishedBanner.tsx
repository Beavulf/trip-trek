"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Archive, Loader2, Scale, X } from "lucide-react";
import { toast } from "sonner";
import { useExpenses, useSetTripStatus, useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";
import { calculateSettlements, moneyParticipants } from "@/lib/budget";
import { isTripFinished } from "@/lib/trip-days";
import { currencySymbol } from "@/lib/currencies";
import { fmtMoney } from "@/lib/utils";

// Баннер-финал: после endDate поездка обычно «повисает» — долги не закрыты,
// статуса completed нет (ретро-кейс 2026-10: Китай, хвост $32 никто не увидел).
// Показываем один раз сверху Обзора: сколько должны + куда идти закрывать +
// владельцу — архивирование. Баннер исчезает, когда статус стал completed.

export function TripFinishedBanner() {
  const { data: trip } = useTrip();
  const { data: expenses } = useExpenses();
  const { data: session } = useAuth();
  const setStatus = useSetTripStatus();
  const { setActiveTab } = useTripStore();
  const [confirming, setConfirming] = useState(false);

  if (!trip || !isTripFinished(trip.settings.endDate, trip.trip?.status)) return null;

  // Те же «участники денег», что на вкладке Бюджет: долги ушедших не должны превращаться в «все закрыто»
  const people = moneyParticipants(trip.participants, trip.formerParticipants, expenses ?? []);
  const settlements = calculateSettlements(expenses ?? [], people);
  const debtTotal = settlements.reduce((s, x) => s + x.amount, 0);
  const hasDebts = debtTotal > 0.005;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const isOwner = trip.participants.some(
    (p) => p.id === currentUserId && p.role === "owner"
  );
  const sym = currencySymbol(trip.settings.currency);

  const archive = () => {
    setStatus.mutate("completed", {
      onSuccess: () => {
        toast.success("Поездка завершена и заархивирована 🏁");
        setConfirming(false);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Не получилось"),
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5" aria-hidden>
          🏁
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-sm font-semibold">Поездка завершена!</div>
          {hasDebts ? (
            <>
              <p className="text-xs text-muted-foreground">
                Остались нерассчитанные долги:{" "}
                <b className="text-foreground">
                  {sym}
                  {fmtMoney(debtTotal)}
                </b>{" "}
                — закройте их и отметьте переводы.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("budget")}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white active:scale-[0.98] transition-transform"
              >
                <Scale className="size-4" /> Закрыть долги →
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Все долги закрыты — поездка удалась ✨
            </p>
          )}

          {isOwner &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Уйти в архив?</span>
                <button
                  type="button"
                  onClick={archive}
                  disabled={setStatus.isPending}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {setStatus.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                  Да, завершить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-input px-3.5 text-xs font-medium active:scale-[0.98] transition-transform"
                >
                  <X className="size-3.5" /> Отмена
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-transform"
              >
                <Archive className="size-3.5" /> Завершить поездку
              </button>
            ))}
        </div>
      </div>
    </motion.section>
  );
}
