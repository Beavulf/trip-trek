"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { CATEGORY_META, type Day, type Place } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlaceRow } from "./PlaceRow";
import { DeleteDayButton } from "./DeleteDayButton";

interface DayCardProps {
  day: Day;
  onOpenPlace: (p: Place) => void;
  onAddPlace?: (dayId: string) => void;
}

export function DayCard({ day, onOpenPlace, onAddPlace }: DayCardProps) {
  const [expanded, setExpanded] = useState(true);
  const visited = day.places.filter((p) => p.status === "visited").length;
  const progress = day.places.length ? (visited / day.places.length) * 100 : 0;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden card-hover">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full flex items-center gap-3 p-4 hover:bg-accent/40 transition-colors text-left active:bg-accent/60 cursor-pointer"
      >
        <div
          className="size-11 rounded-xl grid place-items-center text-white font-bold shrink-0 shadow-lg"
          style={{ background: day.accentColor ?? "#f97316", boxShadow: `0 4px 12px -2px ${day.accentColor ?? "#f97316"}40` }}
        >
          {day.dayNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {day.city}
          </div>
          <div className="font-semibold text-sm truncate">{day.title}</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: day.accentColor ?? "#f97316" }}
            />
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <DeleteDayButton dayId={day.id} dayNumber={day.dayNumber} />
            <div className="text-xs font-medium tabular-nums">{visited}/{day.places.length}</div>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-1.5">
              {day.places.map((place) => (
                <PlaceRow key={place.id} place={place} accentColor={day.accentColor ?? "#f97316"} onOpen={() => onOpenPlace(place)} />
              ))}
              {/* Empty day CTA */}
              {day.places.length === 0 && onAddPlace && (
                <button
                  onClick={() => onAddPlace(day.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors active:scale-95"
                >
                  <Plus className="size-4" />
                  <span className="text-xs font-medium">Добавить место</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
