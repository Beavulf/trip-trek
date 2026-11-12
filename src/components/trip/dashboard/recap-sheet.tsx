"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTrip } from "@/hooks/use-trip";
import { currencySymbol } from "@/lib/currencies";
import { plural } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AnimatedNumber } from "../budget/AnimatedNumber";
import { ShareCard } from "../share-card";

// «Итоги поездки»: анимированные цифры момента + готовая открытка summary
// (в share-card-art это «ночная сводка закрывшейся поездки» — арт писать не нужно).
// Открывается праздничной кнопкой баннера финала и авто-моментом TripFinale.
export function RecapSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: trip } = useTrip();
  const [cardOpen, setCardOpen] = useState(false);
  // Лист монтируется постоянно (TripFinale держит его смонтированным): если шит
  // закрыли «назад»/свайпом, пока открыта открытка, — закрыть и открытку,
  // иначе она осиротеет поверх приложения
  useEffect(() => {
    if (!open) setCardOpen(false);
  }, [open]);
  if (!trip) return null;
  const sym = currencySymbol(trip.settings.currency);

  const int = (v: number) => String(Math.round(v));
  const money = (v: number) => `${sym}${Math.round(v).toLocaleString("ru-RU")}`;
  const stats = [
    { emoji: "🗓", value: trip.settings.totalDays, format: int, label: plural(trip.settings.totalDays, "день", "дня", "дней") },
    { emoji: "📍", value: trip.visitedPlaces, format: int, label: `из ${trip.totalPlaces} мест` },
    { emoji: "📸", value: trip.totalPhotos, format: int, label: "фото" },
    { emoji: "📔", value: trip.totalJournals, format: int, label: plural(trip.totalJournals, "запись", "записи", "записей") },
    { emoji: "💰", value: trip.totalSpent, format: money, label: "потрачено" },
  ];

  return (
    <>
      <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Итоги поездки">
        <div className="space-y-3 pb-4">
          <p className="truncate text-center text-sm text-muted-foreground">Поездка «{trip.settings.title}»</p>
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s, i) => (
              <motion.div
                key={s.emoji}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, ease: "easeOut" }}
                className={
                  "rounded-2xl border border-border bg-card p-4 text-center" +
                  (i === stats.length - 1 ? " col-span-2" : "")
                }
              >
                <div className="text-2xl" aria-hidden>
                  {s.emoji}
                </div>
                <div className="mt-1 text-2xl font-bold leading-none tabular-nums">
                  <AnimatedNumber value={s.value} format={s.format} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            Открытка «Итоги» →
          </button>
        </div>
      </MobileBottomSheet>
      {/* Открытка поверх шита итогов: закрыли открытку — остались в «Итогах» */}
      {cardOpen && <ShareCard open initialVariant="summary" onOpenChange={setCardOpen} />}
    </>
  );
}
