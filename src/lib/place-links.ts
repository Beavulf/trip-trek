// Внешние ссылки маршрута по месту. Раньше Google-ссылка дублировалась в трёх
// файлах и могла разойтись (OSM-вариант для чилла уже был свой — share.ts).
const CHINA_TRIP = /china|китай|guangzhou|shenzhen|hongkong|hong kong|macau|beijing|shanghai|гуанчжоу|шэньчжэнь|гонконг|макао|пекин|шанхай/i;

/** Поездка по Китаю: Google Maps там без VPN недоступен, поэтому маршрут ведём в Amap */
export function isChinaTrip(text: string): boolean {
  return CHINA_TRIP.test(text);
}

/** Маршрут до точки в Amap. Координаты у нас WGS84, параметр coordinate сообщает об этом карте */
export function amapDirectionsUrl(lat: number, lng: number, name: string) {
  return `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&coordinate=wgs84&callnative=1`;
}

/** Поиск в Amap, когда координат нет */
export function amapSearchUrl(query: string) {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}&callnative=1`;
}

export function googleDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Поиск по адресу — когда у места нет координат (жильё вводят текстом). */
export function googleSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** «Как добраться»: куда вести с учётом страны поездки */
export function directionsUrl(p: { lat: number; lng: number; name: string }, china: boolean) {
  return china ? amapDirectionsUrl(p.lat, p.lng, p.name) : googleDirectionsUrl(p.lat, p.lng);
}
