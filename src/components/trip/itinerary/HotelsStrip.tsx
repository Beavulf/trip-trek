"use client";

import { useMemo } from "react";
import { BedDouble, Copy, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { useTripStore } from "@/lib/trip-store";
import { focusOnMap } from "@/lib/map-bus";
import type { Day } from "@/lib/types";

// Полка отелей поездки: адрес под рукой в дороге — показать таксисту или
// скопировать, прыгнуть на карту (ретро-кейс 2026-10: название отеля на
// китайском держали в чате, потому что другого быстрого места не было).

interface HotelsStripProps {
  days: Day[];
}

export function HotelsStrip({ days }: HotelsStripProps) {
  const { setActiveTab } = useTripStore();

  const hotels = useMemo(
    () =>
      days
        .flatMap((d) =>
          d.places
            .filter((p) => p.category === "hotel")
            .map((p) => ({ place: p, dayNumber: d.dayNumber, city: d.city }))
        )
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [days]
  );

  if (hotels.length === 0) return null;

  return (
    <section aria-label="Отели поездки" className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        <BedDouble className="size-3.5" /> Наши отели
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 snap-x">
        {hotels.map(({ place, dayNumber, city }) => (
          <div
            key={place.id}
            className="snap-start shrink-0 w-[230px] rounded-2xl border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <div className="text-lg leading-none mt-0.5" aria-hidden>
                🏨
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight line-clamp-2">{place.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {city} · день {dayNumber}
                </div>
              </div>
            </div>
            {place.address && (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2" title={place.address}>
                {place.address}
              </p>
            )}
            <div className="flex gap-1.5">
              {place.address && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(place.address ?? "").then(
                      () => toast.success("Адрес скопирован — кидай таксисту 🚕"),
                      () => toast.error("Не удалось скопировать")
                    );
                  }}
                  className="flex-1 min-h-9 rounded-xl border border-border text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-muted active:scale-[0.97] transition-transform"
                >
                  <Copy className="size-3" /> Адрес
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  focusOnMap({ lat: place.lat, lng: place.lng, placeId: place.id });
                  setActiveTab("map");
                }}
                className="flex-1 min-h-9 rounded-xl bg-primary/10 text-primary text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-primary/15 active:scale-[0.97] transition-transform"
              >
                <MapIcon className="size-3" /> На карте
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
