"use client";

import { useQuery } from "@tanstack/react-query";
import type { Weather } from "@/lib/types";

// P1 #5: throw on !ok — UI показывает error + retry (не silent empty)
export function useWeather(city: string, forecast?: number) {
  const params = forecast ? `&forecast=${forecast}` : "";
  return useQuery<Weather>({
    queryKey: ["weather", city, forecast],
    queryFn: async () => {
      // P0 #1: не запрашиваем если city пустой или "custom" (без autocomplete)
      if (!city || city === "custom") {
        throw new Error("Нет координат — выберите город в Маршруте");
      }
      const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}${params}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as Weather;
    },
    // P0 #1: enabled только когда city валиден (не пустой, не "custom")
    enabled: Boolean(city) && city !== "custom",
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// Погода по координатам (для любых городов)
// P0 #1: enabled только когда РЕАЛЬНЫЕ coords (не 0,0 Null Island)
export function useWeatherByCoords(lat: number | null, lng: number | null, name: string, timezone?: string, forecast?: number) {
  const hasRealCoords = lat != null && lng != null && lat !== 0 && lng !== 0;
  const params = new URLSearchParams();
  if (lat != null) params.set("lat", String(lat));
  if (lng != null) params.set("lng", String(lng));
  params.set("name", name);
  if (timezone) params.set("timezone", timezone);
  if (forecast) params.set("forecast", String(forecast));
  return useQuery<Weather>({
    queryKey: ["weather-coords", lat, lng, name, timezone, forecast],
    queryFn: async () => {
      const r = await fetch(`/api/weather?${params}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as Weather;
    },
    // P0 #1: только при реальных coords — не (0,0)
    enabled: hasRealCoords,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
