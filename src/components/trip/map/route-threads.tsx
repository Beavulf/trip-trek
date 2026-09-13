"use client";

// Нити маршрута: полилинии между местами дня в цвете дня.
// Сплошная линия — оба места посещены, пунктир — впереди.
// Сегменты сегодняшнего дня рендерим в отдельной панели — её пунктир
// «бежит» (CSS .leaflet-pane-route-today), className у path в setStyle
// не попадает, поэтому панель вместо класса.
// Логика построения — чистая функция buildRouteThreads (src/lib/route-threads.ts).
import { useMemo, type ReactNode } from "react";
import { Polyline, Pane } from "react-leaflet";
import type { Day, Place } from "@/lib/types";
import { buildRouteThreads } from "@/lib/route-threads";

export function RouteThreads({
  places,
  currentDayNumber,
}: {
  places: { place: Place; day: Day }[];
  currentDayNumber?: number;
}) {
  const segments = useMemo(
    () => buildRouteThreads(places, currentDayNumber),
    [places, currentDayNumber]
  );

  const others: ReactNode[] = [];
  const today: ReactNode[] = [];

  for (const s of segments) {
    const segment = (
      <Polyline
        key={`${s.a.id}-${s.b.id}`}
        positions={[
          [s.a.lat, s.a.lng],
          [s.b.lat, s.b.lng],
        ]}
        pathOptions={{
          color: s.color,
          weight: s.isToday ? 4 : 2.5,
          opacity: s.isToday ? 0.85 : 0.55,
          dashArray: s.done ? undefined : "5 9",
          lineCap: "round",
          interactive: false,
        }}
      />
    );
    (s.isToday ? today : others).push(segment);
  }

  return (
    <>
      {others}
      {today.length > 0 && <Pane name="route-today">{today}</Pane>}
    </>
  );
}
