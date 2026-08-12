"use client";

import { useState, useEffect } from "react";
import { Locate, Loader2, AlertCircle, RotateCw } from "lucide-react";
import { useNearby } from "@/hooks/use-trip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeoState } from "./types";
import { cachedGeo } from "./types";
import { NearbyCard } from "./NearbyCard";
import { getTripId } from "@/hooks/use-trip";
import { wishlistDedupeKey } from "@/lib/wishlist";

interface NearbyViewProps {
  category: string;
  onCategoryChange: (c: string) => void;
}

export function NearbyView({ category, onCategoryChange }: NearbyViewProps) {
  const tripId = getTripId();
  // P1 #14: сбрасываем cachedGeo при смене trip — не хотим «GZ кэш» в новой поездке
  useEffect(() => {
    if (cachedGeo.tripId !== tripId) {
      cachedGeo.value = { status: "idle" };
      cachedGeo.tripId = tripId;
    }
  }, [tripId]);

  const [geo, setGeo] = useState<GeoState>(cachedGeo.value);

  const enabled = geo.status === "ready";
  const { data, isLoading, error, refetch } = useNearby(
    geo.status === "ready" ? geo.lat : null,
    geo.status === "ready" ? geo.lng : null,
    category,
    enabled
  );

  const updateGeo = (state: GeoState) => {
    cachedGeo.value = state;
    setGeo(state);
  };

  const requestGeo = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      updateGeo({ status: "denied", message: "Включите геолокацию для поиска мест рядом" });
      return;
    }
    updateGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateGeo({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Включите геолокацию для поиска мест рядом"
            : "Не удалось определить местоположение. Попробуйте ещё раз.";
        updateGeo({ status: "denied", message });
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Дедупликация мест по lat+lng+name (на случай если Overpass вернул дубли)
  const dedupedPlaces = (() => {
    const places = data?.places ?? [];
    const seen = new Set<string>();
    const result = [];
    for (const p of places) {
      const key = wishlistDedupeKey({ name: p.name, lat: p.lat, lng: p.lng });
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(p);
    }
    return result;
  })();

  return (
    <div className="space-y-3">
      {/* Категории */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { key: "all", label: "Все", emoji: "✨" },
          { key: "cafe", label: "Кафе", emoji: "☕" },
          { key: "restaurant", label: "Рестораны", emoji: "🍽️" },
          { key: "bar", label: "Бары", emoji: "🍸" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => onCategoryChange(f.key)}
            className={cn(
              "min-h-[36px] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              category === f.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            <span>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Кнопка геолокации */}
      {geo.status !== "ready" && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card p-4 text-center space-y-2">
          <Locate className="size-6 mx-auto text-muted-foreground" />
          {geo.status === "denied" ? (
            <p className="text-sm text-muted-foreground">{geo.message}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Найдём кафе и рестораны рядом с вами
            </p>
          )}
          <button
            onClick={requestGeo}
            disabled={geo.status === "loading"}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
          >
            {geo.status === "loading" ? (
              <><Loader2 className="size-4 animate-spin" /> Определяем местоположение…</>
            ) : (
              <><Locate className="size-4" /> Найти рядом со мной</>
            )}
          </button>
        </div>
      )}

      {geo.status === "ready" && (
        <>
          <p className="text-[11px] text-muted-foreground px-1 flex items-center gap-1">
            📍 Рядом с вами (радиус 1.5 км) · данные OpenStreetMap
            <button
              onClick={requestGeo}
              className="ml-auto text-primary hover:underline shrink-0"
              title="Обновить местоположение"
            >
              Обновить
            </button>
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Ищем места поблизости…
            </div>
          ) : error ? (
            // P0 #4: теперь ошибка отличается от empty — показываем с кнопкой retry
            <div className="text-center py-12 space-y-2">
              <AlertCircle className="size-8 mx-auto text-red-500" />
              <p className="text-sm text-red-500 max-w-xs mx-auto">
                Не удалось загрузить: {error.message}
              </p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                <RotateCw className="size-3.5" /> Повторить
              </button>
            </div>
          ) : dedupedPlaces.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {/* P1 #13: key = lat+lng+name (раньше key={i} — терял state при ре-ордере) */}
              {dedupedPlaces.map((p) => (
                <NearbyCard
                  key={`${p.lat.toFixed(5)},${p.lng.toFixed(5)}-${p.name}`}
                  place={p}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm space-y-1">
              <div className="text-3xl">🔍</div>
              <p>Поблизости ничего не найдено</p>
              <p className="text-[11px]">Попробуйте сменить категорию или обновить геолокацию</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
