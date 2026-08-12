"use client";

import { useTrip } from "@/hooks/use-trip";
import type { Day } from "@/lib/types";

export function DayPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: trip } = useTrip();
  if (!trip) return null;
  const currentDay = trip.days.find((d) => d.dayNumber === trip.currentDayNumber);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
    >
      {trip.days.map((d: Day) => (
        <option key={d.id} value={d.id}>
          День {d.dayNumber} · {d.city} — {d.title}
        </option>
      ))}
    </select>
  );
}
