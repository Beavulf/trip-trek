"use client";

import { useQuery } from "@tanstack/react-query";
import type { Day } from "@/lib/types";
import { queryKeys } from "@/lib/query-keys";
import { useCurrentTripId } from "./trip-id";

export interface RouteMeta {
  title: string;
  destination: string;
  currency: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  currentDayNumber: number;
}

export interface RouteReadModel {
  days: Day[];
  meta: RouteMeta;
}

async function fetchRoute(tripId: string): Promise<RouteReadModel> {
  const r = await fetch(`/api/route?tripId=${tripId}`);
  if (!r.ok) throw new Error("fetch route failed");
  return r.json();
}

/**
 * Модель чтения маршрута: дни+места и мета поездки ОДНИМ запросом.
 * Единственный источник данных маршрута для карты/маршрута/диалогов —
 * вместо прежних параллельных useDays + useTrip.
 */
export function useRoute() {
  const tripId = useCurrentTripId();
  return useQuery<RouteReadModel>({
    queryKey: queryKeys.route(tripId),
    queryFn: () => (tripId ? fetchRoute(tripId) : Promise.reject(new Error("no trip selected"))),
    enabled: !!tripId,
  });
}

/**
 * Только дни — для потребителей, которым мета не нужна (селекты дня, кнопки удаления).
 * Тот же кэш ["route", tripId], select не дёргает лишних ререндеров на мете.
 */
export function useRouteDays() {
  const tripId = useCurrentTripId();
  return useQuery<RouteReadModel, Error, Day[]>({
    queryKey: queryKeys.route(tripId),
    queryFn: () => (tripId ? fetchRoute(tripId) : Promise.reject(new Error("no trip selected"))),
    select: (r) => r.days,
    enabled: !!tripId,
  });
}
