"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, ListChecks, MapPin, Navigation } from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Day, type Place, type TripSummary } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { timeLabel } from "@/lib/time-of-day";
import { googleDirectionsUrl } from "@/lib/place-links";

interface TodayListProps {
  trip: TripSummary;
  currentDay: Day | undefined;
  isBefore: boolean;
  isAfter: boolean;
  sym: string;
}

/**
 * План на сегодняшний день — с действиями: тап по кружку отмечает «посещено»,
 * стрелка ведёт в навигатор, тап по строке открывает этот день в Маршруте.
 */
export function TodayList({ trip, currentDay, isBefore, isAfter, sym }: TodayListProps) {
  const { setSelectedDay, setActiveTab } = useTripStore();

  if (!currentDay || isAfter) return null;

  const places = currentDay.places;
  const visitedCount = places.filter((p) => p.status === "visited").length;
  const allDone = places.length > 0 && visitedCount === places.length;
  const accent = currentDay.accentColor ?? "#f97316";

  const goToday = () => {
    setSelectedDay(currentDay.dayNumber);
    setActiveTab("itinerary");
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <ListChecks className="size-4" />
          {isBefore ? `План на день ${currentDay.dayNumber}` : "Сегодня в плане"}
        </h2>
        {places.length > 0 && (
          <span
            className={cn(
              "text-[11px] font-semibold px-2 py-0.5 rounded-full min-h-6 grid place-items-center",
              allDone ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"
            )}
          >
            {visitedCount} из {places.length}
          </span>
        )}
      </div>

      {allDone ? (
        <div className="rounded-xl bg-green-500/10 border border-green-500/25 p-4 text-center space-y-2">
          <div className="text-3xl">🎉</div>
          <p className="text-sm font-semibold text-green-600">Все места дня посещены</p>
          <p className="text-xs text-muted-foreground">{currentDay.city} — день закрыт</p>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            Открыть в маршруте
          </button>
        </div>
      ) : places.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-xs text-muted-foreground">На этот день пока нет мест</p>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex items-center gap-1.5 text-xs px-3 min-h-11 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            <MapPin className="size-3.5" /> Добавить места
          </button>
        </div>
      ) : (
        <div className="space-y-1 -mx-1">
          {places.map((p) => (
            <TodayRow key={p.id} place={p} accent={accent} sym={sym} onOpen={goToday} />
          ))}
        </div>
      )}
    </div>
  );
}

function TodayRow({
  place,
  accent,
  sym,
  onOpen,
}: {
  place: Place;
  accent: string;
  sym: string;
  onOpen: () => void;
}) {
  const update = useUpdatePlace();
  const visited = place.status === "visited";
  const meta = CATEGORY_META[place.category];

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await update.mutateAsync({ id: place.id, status: visited ? "planned" : "visited" });
      toast(visited ? "Отмечено как запланировано" : "Посещено! 🎉", {
        description: place.name,
      });
    } catch {
      toast.error("Не удалось обновить статус");
    }
  };

  return (
    <motion.div
      layout
      onClick={onOpen}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-colors group relative overflow-hidden",
        visited ? "opacity-70" : "hover:bg-accent"
      )}
    >
      {/* Цветная полоска города слева */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: visited ? "#22c55e" : accent }}
      />
      <button
        type="button"
        onClick={toggle}
        className="shrink-0 ml-1.5 size-11 grid place-items-center rounded-xl"
        aria-label={visited ? "Отметить как запланированное" : "Отметить посещённым"}
      >
        {visited ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : (
          <Circle className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      <span className="text-lg shrink-0">{meta?.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium truncate leading-tight", visited && "line-through")}>
          {place.name}
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          {place.timeOfDay && <span>{timeLabel(place.timeOfDay, { emoji: true })}</span>}
          {place.budget ? <span>· {sym}{place.budget}</span> : null}
        </div>
      </div>
      {place.lat !== 0 && place.lng !== 0 && (
        <a
          href={googleDirectionsUrl(place.lat, place.lng)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 size-11 grid place-items-center rounded-xl text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
          title="Как добраться"
          aria-label={`Как добраться: ${place.name}`}
        >
          <Navigation className="size-4" />
        </a>
      )}
    </motion.div>
  );
}
