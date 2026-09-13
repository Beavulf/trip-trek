// Концепт «фильтры карты» — единая точка: форма состояния, значения по умолчанию
// и счётчик активных фильтров. Раньше формула бейджа и reset-литерал дублировались
// в trip-map.tsx и filters-sheet.tsx. Кандидат №3 аудита 2026-09-12, фаза 4c.

export interface MapFilters {
  cityFilter: string | null;
  onlyUnvisited: boolean;
  onlyChill: boolean;
  showPhotos: boolean;
  onlyPhotos: boolean;
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  cityFilter: null,
  onlyUnvisited: false,
  onlyChill: false,
  showPhotos: true,
  onlyPhotos: false,
};

/** Сколько фильтров активно (бейдж на кнопке); скрытые фото тоже фильтр. */
export function activeFilterCount(f: MapFilters): number {
  return (
    (f.cityFilter ? 1 : 0) +
    (f.onlyUnvisited ? 1 : 0) +
    (f.onlyChill ? 1 : 0) +
    (f.onlyPhotos ? 1 : 0) +
    (f.showPhotos ? 0 : 1)
  );
}
