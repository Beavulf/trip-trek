"use client";

import { useState } from "react";
import { useDays } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { type Place } from "@/lib/types";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddPlaceSheet, type AddPlaceData } from "../add-place-sheet";
import { DayCard } from "./DayCard";
import { PlaceDialog } from "./PlaceDialog";
import { AddDayButton } from "./AddDayButton";

// Координаты центра города выбранного дня (для добавления места)
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  guangzhou: { lat: 23.1291, lng: 113.2644 },
  shenzhen: { lat: 22.5431, lng: 114.0579 },
  hongkong: { lat: 22.3193, lng: 114.1694 },
  macau: { lat: 22.1987, lng: 113.5439 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  paris: { lat: 48.8566, lng: 2.3522 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  phuket: { lat: 7.8804, lng: 98.3923 },
};

export function Itinerary() {
  const { data: days, isLoading } = useDays();
  const { selectedDay, setSelectedDay } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);

  if (isLoading || !days) return <ItinerarySkeleton />;

  const filteredDays = selectedDay ? days.filter((d) => d.dayNumber === selectedDay) : days;
  const currentDay = selectedDay ? days.find((d) => d.dayNumber === selectedDay) : days[0];

  const openAdd = () => {
    const c = (currentDay && CITY_COORDS[currentDay.cityKey]) || CITY_COORDS.guangzhou;
    setAddData({ lat: c.lat, lng: c.lng, dayId: currentDay?.id });
    setAddOpen(true);
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Кнопка добавления + фильтр по дню */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
          <button
            onClick={() => setSelectedDay(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              !selectedDay ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            Все дни
          </button>
          {days.map((d) => {
            const visited = d.places.filter((p) => p.status === "visited").length;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDay(d.dayNumber)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  selectedDay === d.dayNumber ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: d.accentColor ?? "#f97316" }}
                />
                День {d.dayNumber}
                <span className="opacity-70">{visited}/{d.places.length}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 size-9 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md active:scale-95 transition-transform"
          title="Добавить место"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Дни */}
      {filteredDays.map((day) => (
        <DayCard key={day.id} day={day} onOpenPlace={setOpenPlace} />
      ))}

      {/* Кнопка добавить день */}
      <AddDayButton />

      <PlaceDialog place={openPlace} onClose={() => setOpenPlace(null)} />
      <AddPlaceSheet open={addOpen} onOpenChange={setAddOpen} initial={addData} />
    </div>
  );
}

function ItinerarySkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Фильтр дней */}
      <div className="flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted" />
        ))}
        <div className="size-9 rounded-full bg-muted ml-auto" />
      </div>
      {/* Карточки дней */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
            <div className="size-4 bg-muted rounded" />
          </div>
          <div className="mt-3 space-y-1.5">
            {[0, 1].map((j) => (
              <div key={j} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                <div className="size-6 rounded-full bg-muted" />
                <div className="size-9 rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
