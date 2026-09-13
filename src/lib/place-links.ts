// Внешние ссылки маршрута по месту. Раньше Google-ссылка дублировалась в трёх
// файлах и могла разойтись (OSM-вариант для чилла уже был свой — share.ts).
export function googleDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
