"use client";

import { useQuery } from "@tanstack/react-query";

// === Nearby places (Overpass API) ===
export interface NearbyPlace {
  name: string;
  category: string;
  emoji: string;
  cuisine: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distance: number;
}

interface NearbyResponse {
  places: NearbyPlace[];
  source?: string;
  error?: string;
}

// P0 #4: различаем empty vs error.
// Раньше: `return r.json()` без проверки → 500 от сервера парсилось как `{places: [], error: ...}`
// → UI показывал «ничего не найдено» даже когда сервер упал.
// Теперь: throw на !ok → React Query кладёт в `error` → UI показывает «Не удалось загрузить: …» с retry.
export function useNearby(lat: number | null, lng: number | null, category: string, enabled: boolean) {
  return useQuery<NearbyResponse>({
    queryKey: ["nearby", lat, lng, category],
    queryFn: async () => {
      const r = await fetch(`/api/nearby?lat=${lat}&lng=${lng}&category=${category}`);
      const body = (await r.json().catch(() => ({}))) as NearbyResponse;
      if (!r.ok) {
        // 500 от Overpass / 429 rate limit / 400 bad coords — всё это ошибки, не empty
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      // r.ok === true → нормальный ответ (places может быть пустым массивом — это легитимное empty)
      return body;
    },
    enabled: enabled && lat !== null && lng !== null,
    staleTime: 5 * 60 * 1000,
    retry: 1, // не зацикливаемся на упавшем Overpass
  });
}
