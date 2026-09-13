"use client";

// Хук фильтров карты: три ключа живут в persisted-сторе (переживают перезагрузку),
// два — локальные (сессия вкладки). Патч-семантика: применяются только переданные поля.
// Вся математика — в lib/map-filters.ts. Фаза 4c углубления карты.
import { useState } from "react";
import { useTripStore } from "@/lib/trip-store";
import { type MapFilters, activeFilterCount } from "@/lib/map-filters";

export function useMapFilters() {
  const {
    mapCityFilter,
    setMapCityFilter,
    mapOnlyUnvisited,
    setMapOnlyUnvisited,
    mapOnlyChill,
    setMapOnlyChill,
  } = useTripStore();
  const [showPhotos, setShowPhotos] = useState(true);
  const [onlyPhotos, setOnlyPhotos] = useState(false);

  const filters: MapFilters = {
    cityFilter: mapCityFilter,
    onlyUnvisited: mapOnlyUnvisited,
    onlyChill: mapOnlyChill,
    showPhotos,
    onlyPhotos,
  };

  const patchFilters = (patch: Partial<MapFilters>) => {
    if ("cityFilter" in patch) setMapCityFilter(patch.cityFilter ?? null);
    if ("onlyUnvisited" in patch) setMapOnlyUnvisited(!!patch.onlyUnvisited);
    if ("onlyChill" in patch) setMapOnlyChill(!!patch.onlyChill);
    if ("showPhotos" in patch) setShowPhotos(!!patch.showPhotos);
    if ("onlyPhotos" in patch) setOnlyPhotos(!!patch.onlyPhotos);
  };

  return {
    filters,
    patchFilters,
    /** Выбор города-чипа — частый кейс, отдельный сеттер */
    setCityFilter: setMapCityFilter,
    resetFilters: () => patchFilters({ cityFilter: null, onlyUnvisited: false, onlyChill: false, showPhotos: true, onlyPhotos: false }),
    activeCount: activeFilterCount(filters),
  };
}
