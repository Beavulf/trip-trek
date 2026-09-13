"use client";

// Обратный геокодинг: query с кэшем по координатам вместо мутации.
// Раньше вызывающий (add-place-sheet) вёл собственную дедупликацию geocodedFor —
// кэш React Query делает это сам. Фаза 5 углубления карты.
import { useQuery } from "@tanstack/react-query";

export interface GeocodeResult {
  address: string;
  short: string;
  fallback?: boolean;
}

/** Разовый императивный запрос (когда нужен результат «здесь и сейчас» — map-picker). */
export async function fetchGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
  if (!r.ok) throw new Error("geocode failed");
  return r.json();
}

/**
 * Адрес по координатам. Ответ кэшируется навсегда: координаты не меняются —
 * повторное открытие формы на той же точке не бьёт в сеть.
 */
export function useReverseGeocode(lat: number, lng: number, enabled = true) {
  return useQuery<GeocodeResult>({
    queryKey: ["geocode", lat, lng],
    queryFn: () => fetchGeocode(lat, lng),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}
