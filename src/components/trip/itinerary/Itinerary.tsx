"use client";

import { useState } from "react";
import { useDays, useTrip } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { type Place } from "@/lib/types";
import { Plus, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddPlaceSheet, type AddPlaceData } from "../add-place-sheet";
import { DayCard } from "./DayCard";
import { PlaceDialog } from "./PlaceDialog";
import { AddDayButton } from "./AddDayButton";

// Координаты центра города (для добавления места)
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  guangzhou: { lat: 23.1291, lng: 113.2644 },
  shenzhen: { lat: 22.5431, lng: 114.0579 },
  hongkong: { lat: 22.3193, lng: 114.1694 },
  macau: { lat: 22.1987, lng: 113.5439 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  paris: { lat: 48.8566, lng: 2.3522 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  phuket: { lat: 7.8804, lng: 98.3923 },
  seoul: { lat: 37.5665, lng: 126.9780 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  dubai: { lat: 25.2048, lng: 55.2708 },
};

export function Itinerary() {
  const { data: days, isLoading } = useDays();
  const { data: trip } = useTrip();
  const { selectedDay, setSelectedDay } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);

  // Нет поездки
  if (!isLoading && !trip) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            onClick={() => useTripStore.setState({ activeTab: "dashboard" })}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-2.5 text-sm font-medium active:scale-95 transition-transform"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <ItinerarySkeleton />;

  const dayList = days || [];
  const filteredDays = selectedDay ? dayList.filter((d) => d.dayNumber === selectedDay) : dayList;
  const currentDay = selectedDay ? dayList.find((d) => d.dayNumber === selectedDay) : dayList[0];

  const openAdd = () => {
    if (!currentDay) {
      toast.error("Сначала добавьте день");
      return;
    }
    // Координаты: из cityKey или парсим custom-lat-lng
    let coords: { lat: number; lng: number } | null = null;
    if (currentDay.cityKey && CITY_COORDS[currentDay.cityKey]) {
      coords = CITY_COORDS[currentDay.cityKey];
    } else if (currentDay.cityKey?.startsWith("custom-")) {
      const parts = currentDay.cityKey.split("-");
      const lat = parseFloat(parts[1]);
      const lng = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng)) coords = { lat, lng };
    }
    // Fallback — центр из первого места дня, или нейтральные 0,0
    if (!coords && currentDay.places.length > 0) {
      coords = { lat: currentDay.places[0].lat, lng: currentDay.places[0].lng };
    }
    if (!coords) coords = { lat: 0, lng: 0 };

    setAddData({ lat: coords.lat, lng: coords.lng, dayId: currentDay?.id });
    setAddOpen(true);
  };

  // Нет дней
  if (dayList.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <div className="text-4xl mb-3 opacity-50">📅</div>
          <p className="text-sm font-medium text-muted-foreground">Дней пока нет</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Добавьте первый день маршрута</p>
        </div>
        <AddDayButton />
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Кнопка добавления + фильтр по дню */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
          <button
            onClick={() => setSelectedDay(null)}
            className={cn(
              "min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
              !selectedDay ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            Все дни
          </button>
          {dayList.map((d) => {
            const visited = d.places.filter((p) => p.status === "visited").length;
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDay(d.dayNumber)}
                className={cn(
                  "flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
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
          disabled={!currentDay}
          className="shrink-0 size-9 min-h-[36px] rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md active:scale-95 transition-transform disabled:opacity-50"
          title={currentDay ? "Добавить место" : "Сначала добавьте день"}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Дни */}
      {filteredDays.map((day) => (
        <DayCard key={day.id} day={day} onOpenPlace={setOpenPlace} onAddPlace={(dayId) => {
          const d = dayList.find((dd) => dd.id === dayId);
          if (d) {
            let coords: { lat: number; lng: number } = { lat: 0, lng: 0 };
            if (d.cityKey && CITY_COORDS[d.cityKey]) {
              coords = CITY_COORDS[d.cityKey];
            } else if (d.cityKey?.startsWith("custom-")) {
              const parts = d.cityKey.split("-");
              const lat = parseFloat(parts[1]);
              const lng = parseFloat(parts[2]);
              if (!isNaN(lat) && !isNaN(lng)) coords = { lat, lng };
            }
            setAddData({ lat: coords.lat, lng: coords.lng, dayId: d.id });
            setAddOpen(true);
          }
        }} />
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
      <div className="flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-20 rounded-full bg-muted" />
        ))}
        <div className="size-9 rounded-full bg-muted ml-auto" />
      </div>
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
