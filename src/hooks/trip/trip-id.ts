"use client";

import { useEffect } from "react";
import { useTripStore } from "@/lib/trip-store";

const LS_KEY = "triptrek-current-trip";
/** Pre-multi-trip seed id — not a real DB trip anymore. */
const LEGACY_TRIP_IDS = new Set(["default-trip"]);

function sanitizeTripId(id: string | null | undefined): string {
  if (!id || LEGACY_TRIP_IDS.has(id)) return "";
  return id;
}

/** Sync read — store first, then legacy localStorage. */
export function getTripId(): string {
  if (typeof window === "undefined") return "";
  const fromStore = sanitizeTripId(useTripStore.getState().currentTripId);
  if (fromStore) return fromStore;
  return sanitizeTripId(localStorage.getItem(LS_KEY));
}

/** Write both Zustand (reactive) and legacy LS key. */
export function setTripId(id: string) {
  if (typeof window !== "undefined") {
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  }
  useTripStore.getState().setCurrentTripId(id);
}

/**
 * Reactive tripId for query keys / enabled.
 * Hydrates from legacy LS once if store is empty.
 */
export function useCurrentTripId(): string {
  const tripId = useTripStore((s) => s.currentTripId);
  const clean = sanitizeTripId(tripId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Drop legacy ids stuck in persist/LS so APIs stop getting 403.
    if (tripId && !clean) {
      setTripId("");
      return;
    }
    if (clean) return;
    const legacy = sanitizeTripId(localStorage.getItem(LS_KEY));
    if (legacy) useTripStore.getState().setCurrentTripId(legacy);
  }, [tripId, clean]);

  return clean || (typeof window !== "undefined" ? sanitizeTripId(localStorage.getItem(LS_KEY)) : "");
}
