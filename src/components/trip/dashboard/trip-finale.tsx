"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTripId, useExpenses, useTrip } from "@/hooks/use-trip";
import { calculateSettlements, moneyParticipants } from "@/lib/budget";
import { isTripFinished } from "@/lib/trip-days";
import {
  debtClearSeenKey,
  debtHadKey,
  recapSeenKey,
  shouldAutoRecap,
  shouldCelebrateDebts,
} from "@/lib/celebrations";
import { CelebrationOverlay } from "../celebration-overlay";
import { RecapSheet } from "./recap-sheet";
import { TripFinishedBanner } from "./TripFinishedBanner";

// Оркестратор финала поездки: баннер + авто-моменты «долги закрыты» и «Итоги».
// Все пороги — чистые правила lib/celebrations; здесь только данные и очередь:
// один момент за раз, «Итоги» открываются после закрытия праздника долгов.
export function TripFinale() {
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const { data: expenses } = useExpenses();
  const [debtsClearOpen, setDebtsClearOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // Праздник долгов открыт и/или recap в очереди: ref, чтобы эффект не зависел от UI-состояния
  const queueBusy = useRef(false);

  const ready = !!tripId && !!trip && !!expenses;
  const finished = !!trip && isTripFinished(trip.settings.endDate, trip.trip?.status);
  // Те же «участники денег», что в баннере и на вкладке Бюджет: долги ушедших не превращаются в «чисто»
  const people = trip ? moneyParticipants(trip.participants, trip.formerParticipants, expenses ?? []) : [];
  const settlements = trip ? calculateSettlements(expenses ?? [], people) : [];
  const debtTotal = settlements.reduce((s, x) => s + x.amount, 0);
  const hasDebts = debtTotal > 0.005;
  const hadSpending = (expenses ?? []).some((e) => e.category !== "settlement");

  useEffect(() => {
    if (!ready || !finished || !tripId) return;
    const get = (k: string): string | null => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null; // приватный режим — без праздников
      }
    };
    const mark = (k: string) => {
      try {
        localStorage.setItem(k, "1");
      } catch {
        /* приватный режим */
      }
    };

    if (hasDebts) {
      mark(debtHadKey(tripId));
      return;
    }
    const had = !!get(debtHadKey(tripId));
    if (shouldCelebrateDebts(had, true, !!get(debtClearSeenKey(tripId)))) {
      mark(debtClearSeenKey(tripId));
      // «Итоги» ещё не показывали? Покажем сразу после закрытия праздника.
      // seen отмечаем сейчас: решение показать принято, повторный прогон эффекта не должен его отменить
      queueBusy.current = shouldAutoRecap({ finished: true, hasDebts: false, hadSpending, seen: false });
      if (queueBusy.current) mark(recapSeenKey(tripId));
      setDebtsClearOpen(true);
      return;
    }
    if (queueBusy.current) return; // recap ждёт закрытия праздника
    if (shouldAutoRecap({ finished: true, hasDebts: false, hadSpending, seen: !!get(recapSeenKey(tripId)) })) {
      mark(recapSeenKey(tripId));
      // Задержка: дать Обзору дообитать, оверлей не бьёт по открывшему приложение
      const t = setTimeout(() => setRecapOpen(true), 1000);
      return () => clearTimeout(t);
    }
  }, [ready, finished, tripId, hasDebts, hadSpending]);

  const closeDebtsClear = (openRecap: boolean) => {
    setDebtsClearOpen(false);
    if (openRecap && queueBusy.current) {
      queueBusy.current = false;
      setTimeout(() => setRecapOpen(true), 350);
    } else {
      queueBusy.current = false;
    }
  };

  return (
    <>
      <TripFinishedBanner onShowRecap={() => setRecapOpen(true)} />
      <CelebrationOverlay
        open={debtsClearOpen}
        onOpenChange={(v) => {
          if (!v) closeDebtsClear(true);
        }}
        emoji="🤝"
        title="Все долги закрыты!"
        subtitle="Ни одного хвоста — поездка завершена красиво."
        actions={[
          { label: "Итоги поездки", onClick: () => closeDebtsClear(true) },
          { label: "Понятно", onClick: () => closeDebtsClear(false) },
        ]}
      />
      <RecapSheet open={recapOpen} onOpenChange={setRecapOpen} />
    </>
  );
}
