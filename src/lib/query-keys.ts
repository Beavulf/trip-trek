// Контракт query-ключей TanStack Query и хелперы инвалидации.
// Ключи рассыпались литералами по хукам, WS-шине и компонентам — при добавлении
// новой проекции маршрута (["route"]) часть инвалидаций молча пропускала её.
import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  route: (tripId: string | null) => ["route", tripId] as const,
  trip: (tripId: string | null) => ["trip", tripId] as const,
  photosGeo: (tripId: string | null) => ["photos-geo", tripId] as const,
};

/**
 * Данные маршрута изменились (place:*, day-мутации, photo-гео).
 * Инвалидирует проекции маршрута: route (модель чтения) и trip (слим-сводка).
 * Легаси-ключ ["days"] похоронен (аудит перфоманса 2026-09-13): читателей у него
 * не было с вывода ["days"] из обращения — GET /api/days тоже удалён.
 */
export function invalidateRouteData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["route"] });
  qc.invalidateQueries({ queryKey: ["trip"] });
}
