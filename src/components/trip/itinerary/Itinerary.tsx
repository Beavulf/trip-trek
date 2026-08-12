"use client";

import { useState } from "react";
import { useDays, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { type Place } from "@/lib/types";
import { resolveCityCoords, decodeCustomKey } from "@/lib/city-coords";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddPlaceSheet, type AddPlaceData } from "../add-place-sheet";
import { DayCard } from "./DayCard";
import { PlaceDialog } from "./PlaceDialog";
import { AddDayButton } from "./AddDayButton";

function dayCoords(day: {
  cityKey: string;
  places: { lat: number; lng: number }[];
}): { lat: number; lng: number } | null {
  const known = resolveCityCoords(day.cityKey);
  if (known) return { lat: known.lat, lng: known.lng };
  const custom = decodeCustomKey(day.cityKey);
  if (custom) return { lat: custom.lat, lng: custom.lng };
  if (day.places?.length > 0 && day.places[0].lat && day.places[0].lng) {
    return { lat: day.places[0].lat, lng: day.places[0].lng };
  }
  return null;
}

export function Itinerary() {
  const tripId = useCurrentTripId();
  const { data: days, isLoading: daysLoading, isError: daysError, refetch: refetchDays } = useDays();
  const { data: trip, isLoading: tripLoading, isError: tripError, refetch: refetchTrip } = useTrip();
  const { selectedDay, setSelectedDay } = useTripStore();
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addData, setAddData] = useState<AddPlaceData | null>(null);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🗺️</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            type="button"
            onClick={() => useTripStore.setState({ activeTab: "dashboard" })}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 transition-transform min-h-11"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  if (tripError || daysError) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить маршрут</p>
        <button
          type="button"
          onClick={() => {
            void refetchTrip();
            void refetchDays();
          }}
          className="inline-flex text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (tripLoading || daysLoading || !trip) {
    return <ItinerarySkeleton />;
  }

  const dayList = days || [];
  const filteredDays = selectedDay ? dayList.filter((d) => d.dayNumber === selectedDay) : dayList;
  const currentDay = selectedDay ? dayList.find((d) => d.dayNumber === selectedDay) : dayList[0];

  const openAddForDay = (day: (typeof dayList)[number]) => {
    const coords = dayCoords(day);
    if (!coords) {
      toast.error("Нет координат для дня", {
        description: "Укажи город дня или добавь место с карты",
      });
      return;
    }
    setAddData({ lat: coords.lat, lng: coords.lng, dayId: day.id });
    setAddOpen(true);
  };

  const openAdd = () => {
    if (!currentDay) {
      toast.error("Сначала добавьте день");
      return;
    }
    openAddForDay(currentDay);
  };

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
      <div className="flex items-center gap-2">
        <div className="chip-rail no-scrollbar flex-1 gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              "min-h-11 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
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
                type="button"
                onClick={() => setSelectedDay(d.dayNumber)}
                className={cn(
                  "flex items-center gap-1.5 min-h-11 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95",
                  selectedDay === d.dayNumber
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border hover:bg-accent"
                )}
              >
                <span className="size-2 rounded-full" style={{ background: d.accentColor ?? "#f97316" }} />
                День {d.dayNumber}
                <span className="opacity-70">
                  {visited}/{d.places.length}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!currentDay}
          className="shrink-0 size-11 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-md active:scale-95 transition-transform disabled:opacity-50"
          title={currentDay ? "Добавить место" : "Сначала добавьте день"}
          aria-label="Добавить место"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {filteredDays.map((day) => (
        <DayCard
          key={day.id}
          day={day}
          onOpenPlace={setOpenPlace}
          onAddPlace={(dayId) => {
            const d = dayList.find((dd) => dd.id === dayId);
            if (d) openAddForDay(d);
          }}
        />
      ))}

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
          <div key={i} className="h-11 w-20 rounded-full bg-muted" />
        ))}
        <div className="size-11 rounded-full bg-muted ml-auto" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Загрузка маршрута…
      </div>
    </div>
  );
}
