"use client";

import { motion } from "framer-motion";
import { ChevronRight, MapPin } from "lucide-react";
import { CATEGORY_META, type TripSummary } from "@/lib/types";
import { timeLabel } from "./DashboardHero";

export function NextPlaceWidget({ trip, onGoToItinerary }: { trip: TripSummary; onGoToItinerary: () => void }) {
  // Находим следующее непосещённое место текущего дня (или следующего дня)
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  let nextPlace = currentDay?.places.find((p) => p.status !== "visited");

  // Если в текущем дне нет — ищем в следующих днях
  if (!nextPlace) {
    const upcomingDays = trip.days.filter((d) => d.dayNumber >= trip.currentDayNumber);
    for (const d of upcomingDays) {
      const found = d.places.find((p) => p.status !== "visited");
      if (found) {
        nextPlace = found;
        break;
      }
    }
  }

  if (!nextPlace) {
    const noPlaces = trip.totalPlaces === 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          noPlaces
            ? "rounded-2xl bg-muted/40 border border-border p-4"
            : "rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 p-4"
        }
      >
        <div className="flex items-center gap-3">
          <div
            className={
              noPlaces
                ? "size-12 rounded-xl grid place-items-center text-2xl bg-muted"
                : "size-12 rounded-xl grid place-items-center text-2xl bg-green-500/20"
            }
          >
            {noPlaces ? "🗺️" : "🎉"}
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {noPlaces ? "Нет мест в маршруте" : "Все места посещены!"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {noPlaces ? "Добавьте места, чтобы начать планировать" : "Поздравляем с завершением маршрута"}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  const meta = CATEGORY_META[nextPlace.category];
  const dayOfPlace = trip.days.find((d) => d.id === nextPlace.dayId);

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onGoToItinerary}
      className="w-full rounded-2xl bg-card border-2 border-primary/20 hover:border-primary/40 p-4 text-left transition-colors relative overflow-hidden group"
    >
      {/* Декоративный фон */}
      <div
        className="absolute -top-4 -right-4 size-20 rounded-full opacity-10 blur-2xl"
        style={{ background: meta?.color ?? "#f97316" }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="size-14 rounded-2xl grid place-items-center text-2xl shrink-0 transition-transform group-hover:scale-110"
          style={{ background: `${meta?.color}22` }}
        >
          {meta?.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-medium uppercase tracking-wide mb-0.5">
            <MapPin className="size-2.5" /> Следующее место
          </div>
          <h3 className="font-bold text-sm leading-tight truncate">{nextPlace.name}</h3>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            <span>День {dayOfPlace?.dayNumber} · {dayOfPlace?.city}</span>
            {nextPlace.timeOfDay && <span>· {timeLabel(nextPlace.timeOfDay)}</span>}
          </div>
          {nextPlace.address && (
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-0.5">
              <MapPin className="size-2" /> {nextPlace.address}
            </div>
          )}
        </div>
        <ChevronRight className="size-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
      </div>
    </motion.button>
  );
}
