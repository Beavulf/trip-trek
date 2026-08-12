import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TripTab =
  | "dashboard"
  | "timeline"
  | "itinerary"
  | "map"
  | "gallery"
  | "budget"
  | "rest"
  | "journal"
  | "ai"
  | "food"
  | "phrases"
  | "weather"
  | "transport"
  | "board"
  | "achievements"
  | "info";

interface TripState {
  activeTab: TripTab;
  setActiveTab: (t: TripTab) => void;
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
  selectedDay: number | null;
  setSelectedDay: (d: number | null) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  tripSwitcherOpen: boolean;
  setTripSwitcherOpen: (v: boolean) => void;
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
      currentTripId: "",
      setCurrentTripId: (id) =>
        set({
          currentTripId: id,
          mapCityFilter: null,
          mapOnlyUnvisited: false,
          mapOnlyChill: false,
          selectedDay: null,
        }),
      tripSwitcherOpen: false,
      setTripSwitcherOpen: (v) => set({ tripSwitcherOpen: v }),
      mapCityFilter: null,
      setMapCityFilter: (c) => set({ mapCityFilter: c }),
      mapOnlyUnvisited: false,
      setMapOnlyUnvisited: (v) => set({ mapOnlyUnvisited: v }),
      mapOnlyChill: false,
      setMapOnlyChill: (v) => set({ mapOnlyChill: v }),
    }),
    {
      name: "triptrek-store",
      partialize: (s) => ({
        activeTab: s.activeTab,
        currentUserId: s.currentUserId,
        selectedDay: s.selectedDay,
        currentTripId: s.currentTripId,
        mapCityFilter: s.mapCityFilter,
        mapOnlyUnvisited: s.mapOnlyUnvisited,
        mapOnlyChill: s.mapOnlyChill,
      }),
    }
  )
);
