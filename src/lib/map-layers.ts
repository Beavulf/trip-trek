// Слои подложки карты — общий модуль для TripMap и map-picker.
// Раньше список жил в trip-map.tsx, а пикер держал свой устаревший CARTO URL
// (с 2025 требует apikey — карта от него отказалась, пикер продолжал им пользоваться).

export type MapLayerKey = "voyager" | "satellite" | "light" | "dark";

export const TILE_LAYERS: Record<MapLayerKey, { url: string; attr: string }> = {
  voyager: {
    // CARTO с 2025 требует apikey — используем классический OSM
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
  light: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri",
  },
};
