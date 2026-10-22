// Фабрики иконок Leaflet. L.*-код живёт только в map/ (canvas.tsx, icons.ts, route-threads.tsx)
// — компоненты страницы не должны трогать Leaflet напрямую.
import L from "leaflet";

// Кэш иконок: makeIcon создаёт новый L.DivIcon на каждый вызов, а без кэша
// каждый ререндер карты (рефетч дней, фильтры) заменял DOM всех маркеров.
const pinIconCache = new Map<string, L.DivIcon>();
const photoIconCache = new Map<string, L.DivIcon>();
const photoClusterIconCache = new Map<string, L.DivIcon>();

// URL уходит в HTML-строку divIcon — экранируем, чтобы подпись/путь не ломали разметку
const escAttr = (s: string) =>
  s.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const safeUrl = escAttr(thumbUrl);
  const icon = L.divIcon({
    className: "trip-photo-pin",
    html: `<div style="
      width:40px;height:40px;border-radius:50%;overflow:hidden;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      background:#000;
    "><img src="${safeUrl}" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover;" /></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
  photoIconCache.set(thumbUrl, icon);
  return icon;
}

// Кластер фото-меток: та же круглая миниатюра (чуть крупнее) + бейдж с числом снимков
export function makePhotoClusterIcon(thumbUrl: string, count: number) {
  const cacheKey = `${thumbUrl}|${count}`;
  const cached = photoClusterIconCache.get(cacheKey);
  if (cached) return cached;
  const badge = count > 99 ? "99+" : String(count);
  const icon = L.divIcon({
    className: "trip-photo-pin",
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="
        width:44px;height:44px;border-radius:50%;overflow:hidden;
        border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
        background:#000;
      "><img src="${escAttr(thumbUrl)}" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover;" /></div>
      <span style="
        position:absolute;top:-6px;right:-8px;min-width:22px;height:22px;padding:0 5px;
        box-sizing:border-box;border-radius:11px;background:#f97316;color:#fff;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);
        font:700 11px/18px system-ui,sans-serif;text-align:center;
      ">${badge}</span>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
  photoClusterIconCache.set(cacheKey, icon);
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
