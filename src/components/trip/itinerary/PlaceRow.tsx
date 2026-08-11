"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import { useUpdatePlace } from "@/hooks/use-trip";
import { CATEGORY_META, type Place } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PlaceRowProps {
  place: Place;
  accentColor: string;
  onOpen: () => void;
}

export function PlaceRow({ place, accentColor, onOpen }: PlaceRowProps) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
    toast(visited ? "Отмечено как запланировано" : "Посещено! 🎉", {
      description: place.name,
    });
  };

  return (
    <motion.div
      layout
      onClick={onOpen}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors group relative overflow-hidden",
        visited ? "bg-green-500/5" : "hover:bg-accent"
      )}
    >
      {/* Левая цветная полоска категории */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: visited ? "#22c55e" : meta?.color ?? accentColor }}
      />
      <button onClick={toggle} className="shrink-0 ml-1">
        {visited ? (
          <CheckCircle2 className="size-6 text-green-500" />
        ) : (
          <Circle className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      <div
        className="size-9 rounded-lg grid place-items-center text-lg shrink-0 transition-transform group-hover:scale-110"
        style={{ background: `${meta?.color}22` }}
      >
        {meta?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium leading-tight", visited && "line-through opacity-60")}>{place.name}</div>
        {/* Адрес */}
        {place.address && (
          <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5">
            <MapPin className="size-2.5 mt-0.5 shrink-0" />
            <span className="line-clamp-1">{place.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
            style={{ background: `${meta?.color}18`, color: meta?.color }}
          >
            {meta?.label}
          </span>
          {place.timeOfDay && (
            <span className="flex items-center gap-0.5"><Clock className="size-2.5" /> {timeLabel(place.timeOfDay)}</span>
          )}
          {place.budget ? (
            <span className="flex items-center gap-0.5"><DollarSign className="size-2.5" /> {place.budget}</span>
          ) : null}
          {place.rating ? <span className="flex items-center gap-0.5 text-amber-500"><Star className="size-2.5 fill-current" /> {place.rating}</span> : null}
        </div>
        {/* Кнопка "как добраться" */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
        >
          <Navigation className="size-2.5" /> Как добраться
        </a>
      </div>
      {visited && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
          ✓
        </span>
      )}
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
