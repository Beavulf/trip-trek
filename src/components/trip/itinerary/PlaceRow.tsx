"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import { CATEGORY_META, type Place } from "@/lib/types";
import { timeLabel } from "@/lib/time-of-day";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Бюджет в человекочитаемом виде (1234.5 → «1 234,5»)
const budgetFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

interface PlaceRowProps {
  place: Place;
  accentColor: string;
  /** Символ валюты поездки для отображения бюджета места */
  currency?: string;
  onOpen: () => void;
}

export function PlaceRow({ place, accentColor, currency, onOpen }: PlaceRowProps) {
  const update = useUpdatePlace();
  const { setActiveTab, setMapFocusTarget } = useTripStore();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";
  const isCurrent = place.status === "current";

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

  const showOnMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMapFocusTarget({ lat: place.lat, lng: place.lng, placeId: place.id });
    setActiveTab("map" as TripTab);
  };

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors group relative overflow-hidden",
        visited ? "bg-green-500/5" : isCurrent ? "bg-orange-500/10" : "hover:bg-accent"
      )}
    >
      {/* Левая цветная полоска категории */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: visited ? "#22c55e" : isCurrent ? "#f97316" : meta?.color ?? accentColor }}
      />
      <button
        onClick={toggle}
        className="shrink-0 ml-1 size-11 grid place-items-center rounded-xl"
        aria-label={visited ? "Отметить как запланированное" : "Отметить посещённым"}
      >
        {visited ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : (
          <Circle className={cn("size-6 transition-colors", isCurrent ? "text-orange-500" : "text-muted-foreground group-hover:text-primary")} />
        )}
      </button>
      <div
        className="size-9 rounded-lg grid place-items-center text-lg shrink-0 transition-transform group-hover:scale-110"
        style={{ background: `${meta?.color}22` }}
      >
        {meta?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium leading-tight break-words", visited && "line-through opacity-60")}>{place.name}</div>
        {/* Адрес */}
        {place.address && (
          <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5">
            <MapPin className="size-2.5 mt-0.5 shrink-0" />
            <span className="line-clamp-1">{place.address}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
          {isCurrent && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-orange-600 bg-orange-500/15">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-orange-500 opacity-75 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-orange-500" />
              </span>
              Сейчас
            </span>
          )}
          {place.timeOfDay && (
            <span className="flex items-center gap-0.5"><Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}</span>
          )}
          {place.budget ? (
            <span className="tabular-nums">{currency ?? "$"}{budgetFmt.format(place.budget)}</span>
          ) : null}
          {place.rating ? <span className="flex items-center gap-0.5 text-amber-500"><Star className="size-2.5 fill-current" /> {place.rating}</span> : null}
        </div>
        {/* Действия: как добраться (внешние карты) · показать на карте поездки */}
        <div className="flex items-center gap-3 mt-1">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Navigation className="size-2.5" /> Как добраться
          </a>
          <button
            onClick={showOnMap}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <MapPin className="size-2.5" /> На карте
          </button>
        </div>
      </div>
      {visited && (
        <span aria-hidden="true" className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
          ✓
        </span>
      )}
    </motion.div>
  );
}
