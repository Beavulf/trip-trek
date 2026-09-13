"use client";

import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Circle, Clock, MapPin, Navigation, Share2, Star, Sunrise, Moon } from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { CATEGORY_META, type Day, type Place } from "@/lib/types";
import { timeIconKey, timeLabel } from "@/lib/time-of-day";
import { currencySymbol } from "@/lib/currencies";
import { toast } from "sonner";
import { cn, haptic } from "@/lib/utils";
import { shareOrCopy, osmDirectionsUrl } from "./share";

interface ChillCardProps {
  place: Place;
  day: Day;
  currency?: string;
  /** Тап по карточке — открыть полный диалог места (редактирование, фото, карта) */
  onOpen?: (place: Place) => void;
}

export function ChillCard({ place, day, currency = "USD", onOpen }: ChillCardProps) {
  const update = useUpdatePlace();
  const { data: session } = useAuth();
  const userName = (session?.user as { name?: string } | undefined)?.name || "Кто-то";
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";
  const isCurrent = place.status === "current";

  // Visit/rating через mutate с onSuccess/onError; userName — API эмитит WS с именем автора.
  const toggleVisited = () => {
    haptic();
    const next = visited ? "planned" : "visited";
    update.mutate(
      { id: place.id, status: next, userName },
      {
        onSuccess: () => {
          toast(visited ? "Снято" : "Отдохнули! 🍵", { description: place.name });
        },
        onError: (err) => {
          toast.error("Не удалось обновить", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  const setRating = (s: number) => {
    update.mutate(
      { id: place.id, rating: s === place.rating ? null : s, userName },
      {
        onError: (err) => {
          toast.error("Не удалось сохранить оценку", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  const sym = currencySymbol(currency);
  const directionsUrl = osmDirectionsUrl(place.lat, place.lng);
  const share = () => shareOrCopy(`Идём: ${place.name}`, directionsUrl, place.name);
  // Оценка нужна только когда место посещено или уже оценена ранее
  const showRating = visited || (place.rating ?? 0) > 0;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-4 flex flex-col transition-colors",
        visited ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
      )}
    >
      {/* Тап по «шапке» карточки — полный диалог места (как в Маршруте) */}
      <button
        type="button"
        onClick={() => onOpen?.(place)}
        aria-label={`Открыть ${place.name}`}
        className="flex items-start gap-3 text-left w-full rounded-xl -m-1 p-1 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="size-12 rounded-xl grid place-items-center text-2xl shrink-0" style={{ background: `${meta?.color}22` }}>
          {meta?.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className={cn("font-semibold text-sm leading-tight flex-1", visited && "text-green-700 dark:text-green-400")}>
              {place.name}
            </h3>
            {isCurrent && (
              <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" /> Сейчас
              </span>
            )}
            {onOpen && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 mt-0.5" />}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            <span className="flex items-center gap-0.5">
              <MapPin className="size-2.5 shrink-0" /> День {day.dayNumber} · {day.city}
            </span>
            {place.timeOfDay && <TimeChip timeOfDay={place.timeOfDay} />}
            {place.budget ? (
              <span className="tabular-nums font-medium text-foreground/70">
                {sym}
                {place.budget}
              </span>
            ) : null}
          </div>
          {place.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{place.description}</p>
          )}
        </div>
      </button>

      {/* Оценка — только когда есть что оценивать: место посещено или уже оценена */}
      {showRating && (
        <div className="flex items-center gap-0.5 mt-3" role="group" aria-label="Оценка места">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setRating(s)}
              disabled={update.isPending}
              aria-label={`Оценить на ${s} звёзд`}
              className="p-1.5 -m-0.5 active:scale-90 transition-transform disabled:opacity-50"
            >
              <Star
                className={cn("size-5", (place.rating ?? 0) >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
              />
            </button>
          ))}
          {place.rating ? (
            <span className="text-[11px] text-muted-foreground ml-1 font-medium">{place.rating}/5</span>
          ) : null}
        </div>
      )}

      {/* Ряд действий: очевидная кнопка статуса + шеринг + навигация */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
        <button
          onClick={toggleVisited}
          disabled={update.isPending}
          aria-pressed={visited}
          className={cn(
            "flex-1 min-h-11 rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] disabled:opacity-50",
            visited
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-muted text-foreground hover:bg-accent"
          )}
        >
          {visited ? <CheckCircle2 className="size-4" /> : <Circle className="size-4 text-muted-foreground" />}
          {visited ? "Отдохнули" : "Отметить"}
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={`Поделиться: ${place.name}`}
          title="Поделиться"
          className="size-11 shrink-0 grid place-items-center rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Share2 className="size-4" />
        </button>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Как добраться до ${place.name}`}
          title="Как добраться"
          className="size-11 shrink-0 grid place-items-center rounded-xl bg-muted text-primary hover:bg-accent transition-colors"
        >
          <Navigation className="size-4" />
        </a>
      </div>
    </motion.div>
  );
}

function TimeChip({ timeOfDay }: { timeOfDay: string }) {
  const key = timeIconKey(timeOfDay);
  if (!key) return null;
  // afternoon исторически показывался часами (Clock), а не солнцем — сохраняем вид
  const Icon = key === "sunrise" ? Sunrise : key === "sun" ? Clock : Moon;
  return (
    <span className="flex items-center gap-0.5">
      <Icon className="size-2.5" /> {timeLabel(timeOfDay)}
    </span>
  );
}
