"use client";

import { CalendarDays } from "lucide-react";
import { useTrip } from "@/hooks/use-trip";
import type { TripDay } from "@/lib/types";

export function DayPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: trip } = useTrip();
  if (!trip?.days?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
        Нет дней в маршруте
      </div>
    );
  }
  return (
    <div className="relative">
      <CalendarDays className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-8 py-2.5 text-sm input-mobile min-h-11 truncate"
        aria-label="День маршрута"
      >
        {trip.days.map((d: TripDay) => (
          <option key={d.id} value={d.id}>
            День {d.dayNumber} · {d.city} — {d.title}
          </option>
        ))}
      </select>
    </div>
  );
}
