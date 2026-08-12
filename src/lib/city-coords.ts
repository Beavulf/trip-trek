// Shared city coordinates dictionary + custom cityKey encode/decode.
// P1 #6: единый source of truth для UI (weather-panel, itinerary) и API (weather route).
// Раньше: types.CITIES (4 China), LEGACY_CITIES (8) в weather route, cityCoords в itinerary — рассинхрон.
export interface CityCoord {
  key: string;
  name: string;
  lat: number;
  lng: number;
  timezone?: string;
  color?: string;
}

// Объединённый словарь всех известных городов (China + Asia + Europe).
// Должен покрывать все cityKey, которые могут быть в trip-templates или добавлены через AddDay.
export const KNOWN_CITIES: Record<string, CityCoord> = {
  // China
  guangzhou: { key: "guangzhou", name: "Гуанчжоу", lat: 23.1291, lng: 113.2644, timezone: "Asia/Shanghai", color: "#f97316" },
  shenzhen: { key: "shenzhen", name: "Шэньчжэнь", lat: 22.5431, lng: 114.0579, timezone: "Asia/Shanghai", color: "#06b6d4" },
  hongkong: { key: "hongkong", name: "Гонконг", lat: 22.3193, lng: 114.1694, timezone: "Asia/Hong_Kong", color: "#ec4899" },
  macau: { key: "macau", name: "Макао", lat: 22.1987, lng: 113.5439, timezone: "Asia/Macau", color: "#8b5cf6" },
  // Asia
  tokyo: { key: "tokyo", name: "Токио", lat: 35.6762, lng: 139.6503, timezone: "Asia/Tokyo", color: "#ef4444" },
  kyoto: { key: "kyoto", name: "Киото", lat: 35.0116, lng: 135.7681, timezone: "Asia/Tokyo", color: "#dc2626" },
  bangkok: { key: "bangkok", name: "Бангкок", lat: 13.7563, lng: 100.5018, timezone: "Asia/Bangkok", color: "#7c3aed" },
  phuket: { key: "phuket", name: "Пхукет", lat: 7.8804, lng: 98.3923, timezone: "Asia/Bangkok", color: "#0891b2" },
  seoul: { key: "seoul", name: "Сеул", lat: 37.5665, lng: 126.9780, timezone: "Asia/Seoul", color: "#3b82f6" },
  singapore: { key: "singapore", name: "Сингапур", lat: 1.3521, lng: 103.8198, timezone: "Asia/Singapore", color: "#ef4444" },
  dubai: { key: "dubai", name: "Дубай", lat: 25.2048, lng: 55.2708, timezone: "Asia/Dubai", color: "#14b8a6" },
  // Europe
  paris: { key: "paris", name: "Париж", lat: 48.8566, lng: 2.3522, timezone: "Europe/Paris", color: "#3b82f6" },
  amsterdam: { key: "amsterdam", name: "Амстердам", lat: 52.3676, lng: 4.9041, timezone: "Europe/Amsterdam", color: "#f59e0b" },
  berlin: { key: "berlin", name: "Берлин", lat: 52.5200, lng: 13.4050, timezone: "Europe/Berlin", color: "#eab308" },
  london: { key: "london", name: "Лондон", lat: 51.5074, lng: -0.1278, timezone: "Europe/London", color: "#6366f1" },
  rome: { key: "rome", name: "Рим", lat: 41.9028, lng: 12.4964, timezone: "Europe/Rome", color: "#d97706" },
};

// P0 #3: надёжный encode/decode для custom cityKey.
// Старый формат "custom-{lat}-{lng}" ломается на отрицательных coords:
// "custom--33.86-151.2".split("-") → ["custom", "", "33.86", "151.2"] → NaN.
// Новый формат: "custom:{lat},{lng}" — двоеточие-разделитель, запятая между lat/lng.
// Совместимость со старым: если ключ начинается с "custom-", пытаемся распарсить старый формат.
export function encodeCustomKey(lat: number, lng: number): string {
  return `custom:${lat},${lng}`;
}

export interface DecodedCity {
  lat: number;
  lng: number;
  isCustom: boolean;
}

export function decodeCustomKey(cityKey: string): DecodedCity | null {
  if (!cityKey) return null;
  // Новый формат: "custom:{lat},{lng}"
  if (cityKey.startsWith("custom:")) {
    const coords = cityKey.slice("custom:".length).split(",");
    const lat = parseFloat(coords[0]);
    const lng = parseFloat(coords[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, isCustom: true };
    return null;
  }
  // Старый формат: "custom-{lat}-{lng}" — поддерживаем для обратной совместимости.
  // Проблема: отрицательные coords. "custom--33.86-151.2" → split("-") = ["custom", "", "33.86", "151.2"]
  // Решение: regex извлекает числа (включая отрицательные).
  if (cityKey.startsWith("custom-")) {
    const match = cityKey.match(/^custom-(-?\d+\.?\d*)-(-?\d+\.?\d*)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng, isCustom: true };
    }
    // Fallback: старый split (работает только для положительных)
    const parts = cityKey.split("-");
    if (parts.length === 3) {
      const lat = parseFloat(parts[1]);
      const lng = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat > 0 && lng > 0) {
        return { lat, lng, isCustom: true };
      }
    }
  }
  return null;
}

// P1 #6: единая функция для резолва координат города.
// Приоритет: KNOWN_CITIES → decode custom key → null (нет coords).
export function resolveCityCoords(cityKey: string): CityCoord | null {
  if (!cityKey || cityKey === "custom") return null;
  // Known city
  if (KNOWN_CITIES[cityKey]) return KNOWN_CITIES[cityKey];
  // Custom key
  const decoded = decodeCustomKey(cityKey);
  if (decoded) {
    return {
      key: cityKey,
      name: "", // name берётся из day.city
      lat: decoded.lat,
      lng: decoded.lng,
      isCustom: true,
    } as CityCoord;
  }
  return null;
}

// Проверка: есть ли у cityKey координаты (known или custom с валидными coords).
export function hasCityCoords(cityKey: string | null | undefined): boolean {
  if (!cityKey || cityKey === "custom") return false;
  return resolveCityCoords(cityKey) !== null;
}
