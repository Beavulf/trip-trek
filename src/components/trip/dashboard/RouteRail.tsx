"use client";

import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import { type TripSummary } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";

/**
 * Линия маршрута: дни как станции на пути, «вы здесь» пульсирует.
 * Пройденные отрезки закрашены цветом города, будущие — пунктиром.
 * Заменяет прежние чипы дней и столбчатый график активности (одни и те же данные).
 */
export function RouteRail({ trip }: { trip: TripSummary }) {
  const { setSelectedDay, setActiveTab } = useTripStore();
  const reduceMotion = useReducedMotion();

  if (!trip.days.length) return null;

  const cities = [...new Map(trip.days.map((d) => [d.cityKey, d])).values()];

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Маршрут по дням
        </h2>
        <button
          type="button"
          onClick={() => setActiveTab("itinerary")}
          className="text-xs text-primary flex items-center gap-1 hover:underline min-h-11 px-2"
        >
          Все дни <ChevronRight className="size-3" />
        </button>
      </div>

      <div className="chip-rail no-scrollbar">
        <div className="flex items-start">
          {trip.days.map((d, i) => {
            const visited = d.places.filter((p) => p.status === "visited").length;
            const isCurrent = d.dayNumber === trip.currentDayNumber;
            const isPast = d.dayNumber < trip.currentDayNumber;
            const accent = d.accentColor ?? "#f97316";
            const hasNext = i < trip.days.length - 1;

            // Текстовая мета — она же идёт в aria-label (WCAG 2.5.3 Label in Name)
            const metaText = isCurrent
              ? "сегодня"
              : isPast
                ? (d.places.length > 0 ? `${visited}/${d.places.length}` : "прошёл")
                : (d.places.length > 0 ? `${d.places.length} ${plural(d.places.length, "место", "места", "мест")}` : "—");
            const meta = isCurrent ? (
              <span className="text-primary font-semibold">{metaText}</span>
            ) : (
              metaText
            );

            return (
              <Fragment key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(d.dayNumber);
                    setActiveTab("itinerary");
                  }}
                  className="flex flex-col items-center gap-1 min-w-[68px] group"
                  aria-label={`День ${d.dayNumber}, ${d.city}, ${metaText}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className="relative">
                    <span
                      className={cn(
                        "size-9 rounded-full grid place-items-center text-xs font-bold transition-transform group-hover:scale-105",
                        (isPast || isCurrent) && "text-white",
                        isCurrent && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card scale-110",
                        !isPast && !isCurrent && "bg-muted text-muted-foreground border border-border"
                      )}
                      style={isPast || isCurrent ? { background: accent } : undefined}
                    >
                      {isPast ? <Check className="size-4" /> : d.dayNumber}
                    </span>
                    {isCurrent && !reduceMotion && (
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full border-2"
                        style={{ borderColor: accent }}
                        animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                      />
                    )}
                  </span>
                  <span className="text-[10px] font-medium truncate max-w-[72px] transition-colors group-hover:text-primary">
                    {d.city}
                  </span>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">{meta}</span>
                </button>
                {hasNext && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      // -mx перекрывает внутренний отступ кнопки (кружок по центру min-w-[68px]),
                      // чтобы линия начиналась прямо у кружка
                      "mt-[17px] w-6 -mx-4 shrink-0",
                      isPast ? "border-t-[3px] rounded-full" : "border-t-2 border-dashed border-border"
                    )}
                    style={isPast ? { borderColor: accent } : undefined}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Легенда городов + общий итог */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground pt-3 mt-2 border-t border-border">
        {cities.map((d) => (
          <span key={d.cityKey} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: d.accentColor ?? "#f97316" }} />
            {d.city}
          </span>
        ))}
        <span className="ml-auto font-medium">
          {trip.visitedPlaces}/{trip.totalPlaces} мест посещено
        </span>
      </div>
    </div>
  );
}
