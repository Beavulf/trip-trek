"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Weather, WeatherDay } from "@/lib/types";

async function fetchWeather(params: URLSearchParams): Promise<Weather> {
  const r = await fetch(`/api/weather?${params}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(body?.error || `Ошибка ${r.status}`);
  }
  return body as Weather;
}

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
      return fetchWeather(new URLSearchParams(`city=${encodeURIComponent(city)}${params}`));
    },
    // P0 #1: enabled только когда city валиден (не пустой, не "custom")
    enabled: Boolean(city) && city !== "custom",
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// Погода по координатам (для любых городов)
// P0 #1: enabled только когда РЕАЛЬНЫЕ coords (не 0,0 Null Island)
export function useWeatherByCoords(
  lat: number | null,
  lng: number | null,
  name: string,
  timezone?: string,
  forecast?: number
) {
  const hasRealCoords = lat != null && lng != null && lat !== 0 && lng !== 0;
  const params = new URLSearchParams();
  if (lat != null) params.set("lat", String(lat));
  if (lng != null) params.set("lng", String(lng));
  params.set("name", name);
  if (timezone) params.set("timezone", timezone);
  if (forecast) params.set("forecast", String(forecast));
  return useQuery<Weather>({
    queryKey: ["weather-coords", lat, lng, name, timezone, forecast],
    queryFn: () => fetchWeather(params),
    // P0 #1: только при реальных coords — не (0,0)
    enabled: hasRealCoords,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export interface WeatherCityLite {
  key: string;
  name: string;
  lat: number;
  lng: number;
  timezone?: string;
}

export interface CitiesWeatherEntry {
  data?: Weather;
  /** Daily-прогноз от даты старта маршрута (когда поездка позже сегодняшнего дня) */
  routeForecast?: WeatherDay[];
  isLoading: boolean;
  error: Error | null;
}

// Погода для всех городов маршрута разом (рельс городов + прогноз «по маршруту»).
// queryKey совпадает с useWeatherByCoords (forecast=7) — кэш общий, герой не дублирует запрос.
// routeStart ("YYYY-MM-DD", позже сегодня) → вторая серия запросов с окном от даты старта:
// открытый прогноз на 7 дней не достаёт до начала будущей поездки.
export function useCitiesWeather(cities: WeatherCityLite[], routeStart?: string | null) {
  const keyed = useMemo(
    () =>
      cities
        .filter((c) => c.lat != null && c.lng != null && c.lat !== 0 && c.lng !== 0)
        .map((c) => ({ ...c, lat: c.lat!, lng: c.lng! })),
    [cities]
  );

  const results = useQueries({
    queries: [
      ...keyed.map((c) => {
        const params = new URLSearchParams({
          lat: String(c.lat),
          lng: String(c.lng),
          name: c.name,
          forecast: "7",
        });
        if (c.timezone) params.set("timezone", c.timezone);
        return {
          queryKey: ["weather-coords", c.lat, c.lng, c.name, c.timezone, 7] as const,
          queryFn: () => fetchWeather(params),
          staleTime: 10 * 60 * 1000,
          retry: 1,
        };
      }),
      // Окно от даты старта маршрута (только когда маршрут начинается позже сегодня)
      ...(routeStart
        ? keyed.map((c) => {
            const params = new URLSearchParams({
              lat: String(c.lat),
              lng: String(c.lng),
              name: c.name,
              forecast: "7",
              start: routeStart,
            });
            if (c.timezone) params.set("timezone", c.timezone);
            return {
              queryKey: ["weather-route", c.lat, c.lng, c.name, c.timezone, routeStart] as const,
              queryFn: () => fetchWeather(params),
              staleTime: 10 * 60 * 1000,
              retry: 1,
            };
          })
        : []),
    ],
  });

  return useMemo(() => {
    const map = new Map<string, CitiesWeatherEntry>();
    keyed.forEach((c, i) => {
      const r = results[i];
      map.set(c.key, {
        data: r.data,
        isLoading: Boolean(r.isLoading),
        error: (r.error as Error | null) ?? null,
      });
    });
    if (routeStart) {
      keyed.forEach((c, j) => {
        const r = results[keyed.length + j];
        const entry = map.get(c.key);
        if (entry && r?.data) entry.routeForecast = r.data.forecast;
      });
    }
    return map;
  }, [keyed, results, routeStart]);
}
