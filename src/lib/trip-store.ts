import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TripTab =
  | "dashboard"
  | "itinerary"
  | "map"
  | "gallery"
  | "budget"
  | "rest"
  | "journal"
  | "info";

interface TripState {
  activeTab: TripTab;
  setActiveTab: (t: TripTab) => void;
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
  selectedDay: number | null;
  setSelectedDay: (d: number | null) => void;
  // фильтр карты
  mapCityFilter: string | null;
  setMapCityFilter: (c: string | null) => void;
  mapOnlyUnvisited: boolean;
  setMapOnlyUnvisited: (v: boolean) => void;
  mapOnlyChill: boolean;
  setMapOnlyChill: (v: boolean) => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      activeTab: "dashboard",
      setActiveTab: (t) => set({ activeTab: t }),
      currentUserId: null,
      setCurrentUserId: (id) => set({ currentUserId: id }),
      selectedDay: null,
      setSelectedDay: (d) => set({ selectedDay: d }),
      mapCityFilter: null,
      setMapCityFilter: (c) => set({ mapCityFilter: c }),
      mapOnlyUnvisited: false,
      setMapOnlyUnvisited: (v) => set({ mapOnlyUnvisited: v }),
      mapOnlyChill: false,
      setMapOnlyChill: (v) => set({ mapOnlyChill: v }),
    }),
    { name: "triptrek-store" }
  )
);
