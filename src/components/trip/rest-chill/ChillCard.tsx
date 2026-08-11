"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, MapPin, Star } from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Day, type Place } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChillCardProps {
  place: Place;
  day: Day;
}

export function ChillCard({ place, day }: ChillCardProps) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        visited ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="size-12 rounded-xl grid place-items-center text-2xl shrink-0" style={{ background: `${meta?.color}22` }}>
          {meta?.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight">{place.name}</h3>
            <button
              onClick={() => {
                update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
                toast(visited ? "Снято" : "Отдохнули! 🍵", { description: place.name });
              }}
            >
              {visited ? <CheckCircle2 className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="size-2.5" /> День {day.dayNumber} · {day.city}
          </div>
          {place.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{place.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {place.budget ? (
              <span className="text-xs text-muted-foreground">${place.budget}</span>
            ) : null}
            {place.timeOfDay && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}
              </span>
            )}
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => update.mutate({ id: place.id, rating: s === place.rating ? null : s })}
                  className="p-1 -m-1 active:scale-90 transition-transform"
                >
                  <Star className={cn("size-6", (place.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function timeLabel(t: string | null) {
  switch (t) {
    case "morning": return "Утро";
    case "afternoon": return "День";
    case "evening": return "Вечер";
    default: return "";
  }
}
