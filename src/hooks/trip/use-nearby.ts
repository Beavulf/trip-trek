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

export function useNearby(lat: number | null, lng: number | null, category: string, enabled: boolean) {
  return useQuery<{ places: NearbyPlace[]; source?: string; error?: string }>({
    queryKey: ["nearby", lat, lng, category],
    queryFn: async () => {
      const r = await fetch(`/api/nearby?lat=${lat}&lng=${lng}&category=${category}`);
      return r.json();
    },
    enabled: enabled && lat !== null && lng !== null,
    staleTime: 5 * 60 * 1000,
  });
}
