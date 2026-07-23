"use client";

import { useDays, useUpdatePlace } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { CATEGORY_META, CITIES, type Place, type Day } from "@/lib/types";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, MapPin, Star, Coffee, Filter, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Кастомный пин
function makeIcon(category: string, status: string, emoji: string) {
  let color = "#94a3b8"; // planned — серый
  if (status === "visited") color = "#22c55e";
  else if (status === "current") color = "#f97316";
  const pulse = status === "current" ? "trip-pin-current" : "";
  return L.divIcon({
    className: `trip-pin ${pulse}`,
    html: `<div class="trip-pin-pin" style="background:${color}"><span>${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export default function TripMap() {
  const { data: days, isLoading } = useDays();
  const { mapCityFilter, setMapCityFilter, mapOnlyUnvisited, setMapOnlyUnvisited, mapOnlyChill, setMapOnlyChill } = useTripStore();

  const allPlaces = useMemo(() => {
    if (!days) return [];
    return days.flatMap((d) => d.places.map((p) => ({ place: p, day: d })));
  }, [days]);

  const filtered = useMemo(() => {
    let res = allPlaces;
    if (mapCityFilter) res = res.filter((x) => x.day.cityKey === mapCityFilter);
    if (mapOnlyUnvisited) res = res.filter((x) => x.place.status !== "visited");
    if (mapOnlyChill) res = res.filter((x) => ["cafe", "bar", "restaurant"].includes(x.place.category));
    return res;
  }, [allPlaces, mapCityFilter, mapOnlyUnvisited, mapOnlyChill]);

  // Центр карты по выбранному городу или общий
  const center = mapCityFilter
    ? CITIES.find((c) => c.key === mapCityFilter)!
    : { lat: 22.8, lng: 113.9, name: "China" }; // между городами

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Загрузка карты…</div>;

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Фильтры */}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-3.5" /> Фильтры
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setMapCityFilter(null)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              !mapCityFilter ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"
            )}
          >
            Все города
          </button>
          {CITIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setMapCityFilter(c.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                mapCityFilter === c.key ? "text-white" : "bg-secondary hover:bg-accent"
              )}
              style={mapCityFilter === c.key ? { background: c.color } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMapOnlyUnvisited(!mapOnlyUnvisited)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              mapOnlyUnvisited ? "bg-primary/10 text-primary border border-primary/30" : "bg-secondary hover:bg-accent"
            )}
          >
            <Circle className="size-3" /> Только непосещённые
          </button>
          <button
            onClick={() => setMapOnlyChill(!mapOnlyChill)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              mapOnlyChill ? "bg-amber-500/10 text-amber-600 border border-amber-500/30" : "bg-secondary hover:bg-accent"
            )}
          >
            <Coffee className="size-3" /> Кафе и бары
          </button>
        </div>
      </div>

      {/* Легенда */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400" /> Запланировано</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-orange-500" /> Сейчас здесь</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-green-500" /> Посещено</span>
        <span className="ml-auto">{filtered.length} мест</span>
      </div>

      {/* Карта */}
      <div className="rounded-2xl overflow-hidden border border-border h-[60vh] min-h-[400px]">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={mapCityFilter ? 12 : 8}
          scrollWheelZoom={false}
          className="w-full h-full"
          key={mapCityFilter || "all"}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <FlyTo center={center} />
          {filtered.map(({ place, day }) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={makeIcon(place.category, place.status, CATEGORY_META[place.category]?.emoji ?? "📍")}
            >
              <Popup>
                <PlacePopup place={place} day={day} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function FlyTo({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.8 });
  }, [center.lat, center.lng, map]);
  return null;
}

function PlacePopup({ place, day }: { place: Place; day: Day }) {
  const update = useUpdatePlace();
  const meta = CATEGORY_META[place.category];
  const visited = place.status === "visited";

  return (
    <div className="p-1 w-52 font-sans">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{meta?.emoji}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${meta?.color}22`, color: meta?.color }}>
          {meta?.label}
        </span>
      </div>
      <div className="font-semibold text-sm leading-tight">{place.name}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
        <MapPin className="size-2.5" /> День {day.dayNumber} · {day.city}
      </div>
      {place.description && (
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{place.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2 text-[11px]">
        {place.budget ? <span className="text-muted-foreground">${place.budget}</span> : null}
        {place.rating ? (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star className="size-2.5 fill-current" /> {place.rating}
          </span>
        ) : null}
      </div>
      <button
        onClick={() => {
          update.mutate({ id: place.id, status: visited ? "planned" : "visited" });
          toast(visited ? "Снято" : "Посещено 🎉", { description: place.name });
        }}
        className={cn(
          "mt-2 w-full rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors",
          visited ? "bg-green-500/10 text-green-600" : "bg-primary text-primary-foreground"
        )}
      >
        {visited ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
        {visited ? "Посещено" : "Отметить"}
      </button>
    </div>
  );
}
