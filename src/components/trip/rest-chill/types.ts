export interface WishlistItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  note?: string;
  visited: boolean;
  rating?: number | null;
  // lat/lng — опционально, для мест добавленных из Nearby (нужно для дедупликации)
  lat?: number;
  lng?: number;
}

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied"; message: string };

// Кэш геолокации между переключениями вкладок.
// P1 #14: сбрасывается при смене trip (см. NearbyView useEffect on tripId).
export const cachedGeo: { value: GeoState; tripId: string | null } = { value: { status: "idle" }, tripId: null };
