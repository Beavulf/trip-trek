export interface WishlistItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  note?: string;
  visited: boolean;
  rating?: number | null;
}

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied"; message: string };

// Кэш геолокации между переключениями вкладок
export const cachedGeo: { value: GeoState } = { value: { status: "idle" } };
