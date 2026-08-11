"use client";

import { useQuery } from "@tanstack/react-query";
import type { Weather } from "@/lib/types";

export function useWeather(city: string, forecast?: number) {
  const params = forecast ? `&forecast=${forecast}` : "";
  return useQuery<Weather>({
    queryKey: ["weather", city, forecast],
    queryFn: async () => {
      const r = await fetch(`/api/weather?city=${city}${params}`);
      return r.json();
    },
    enabled: Boolean(city),
    staleTime: 10 * 60 * 1000,
  });
}

// Погода по координатам (для любых городов)
export function useWeatherByCoords(lat: number, lng: number, name: string, timezone?: string, forecast?: number) {
  const params = new URLSearchParams();
  params.set("lat", String(lat));
  params.set("lng", String(lng));
  params.set("name", name);
  if (timezone) params.set("timezone", timezone);
  if (forecast) params.set("forecast", String(forecast));
  return useQuery<Weather>({
    queryKey: ["weather-coords", lat, lng, name, timezone, forecast],
    queryFn: async () => {
      const r = await fetch(`/api/weather?${params}`);
      return r.json();
    },
    enabled: lat !== 0 || lng !== 0,
    staleTime: 10 * 60 * 1000,
  });
}
