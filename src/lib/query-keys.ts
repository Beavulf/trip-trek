// Контракт query-ключей TanStack Query и хелперы инвалидации.
// Ключи рассыпались литералами по хукам, WS-шине и компонентам — при добавлении
// новой проекции маршрута (["route"]) часть инвалидаций молча пропускала её.
import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  route: (tripId: string | null) => ["route", tripId] as const,
  days: (tripId: string | null) => ["days", tripId] as const,
  trip: (tripId: string | null) => ["trip", tripId] as const,
  photosGeo: (tripId: string | null) => ["photos-geo", tripId] as const,
};

/**
 * Данные маршрута изменились (place:*, day-мутации, photo-гео).
 * Инвалидирует все проекции дней: route (модель чтения), days (legacy), trip (сводка с days).
 */
export function invalidateRouteData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["route"] });
  qc.invalidateQueries({ queryKey: ["days"] });
  qc.invalidateQueries({ queryKey: ["trip"] });
}
