"use client";

// Текущий tripId (из localStorage)
export function getTripId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("triptrek-current-trip") || "";
}

export function setTripId(id: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("triptrek-current-trip", id);
  }
}
