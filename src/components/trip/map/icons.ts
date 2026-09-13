// Фабрики иконок Leaflet. L.*-код живёт только в map/ (canvas.tsx, icons.ts, route-threads.tsx)
// — компоненты страницы не должны трогать Leaflet напрямую.
import L from "leaflet";

// Кэш иконок: makeIcon создаёт новый L.DivIcon на каждый вызов, а без кэша
// каждый ререндер карты (рефетч дней, фильтры) заменял DOM всех маркеров.
const pinIconCache = new Map<string, L.DivIcon>();
const photoIconCache = new Map<string, L.DivIcon>();

// Кастомный пин места
export function makeIcon(category: string, status: string, emoji: string) {
  void category; // в ключе кэша, на цвет не влияет
  const cacheKey = `${category}|${status}|${emoji}`;
  const cached = pinIconCache.get(cacheKey);
  if (cached) return cached;
  let color = "#94a3b8"; // planned — серый
  if (status === "visited") color = "#22c55e";
  else if (status === "current") color = "#f97316";
  const pulse = status === "current" ? "trip-pin-current" : "";
  const icon = L.divIcon({
    className: `trip-pin ${pulse}`,
    html: `<div class="trip-pin-pin" style="background:${color}"><span>${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
  pinIconCache.set(cacheKey, icon);
  return icon;
}

// Фото-пин (круглая миниатюра) — безопасный HTML
export function makePhotoIcon(thumbUrl: string) {
  const cached = photoIconCache.get(thumbUrl);
  if (cached) return cached;
  const safeUrl = thumbUrl.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const icon = L.divIcon({
    className: "trip-photo-pin",
    html: `<div style="
      width:40px;height:40px;border-radius:50%;overflow:hidden;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      background:#000;
    "><img src="${safeUrl}" style="width:100%;height:100%;object-fit:cover;" /></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
  photoIconCache.set(thumbUrl, icon);
  return icon;
}

// Точка геолокации
export function makeLocateIcon() {
  return L.divIcon({
    className: "locate-dot",
    html: `<div class="locate-dot-core"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
