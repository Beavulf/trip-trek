// Кластеризация фото-меток карты. Зачем: карта рисовала метку-<img> на КАЖДОЕ геофото
// (до 1000) — сотни одновременных запросов миниатюр и сотни МБ декодированных битмапов
// на телефоне ради кружков по 40px, большая часть которых лежит друг на друге (снято в
// одном месте). Здесь фото схлопываются в ячейки экранной сетки на текущем зуме, а в DOM
// попадает только то, что в кадре. Чистые функции без Leaflet — см. map/photo-pins.tsx.

const TILE = 256;

/** Шаг экранной сетки, px: чуть больше диаметра метки (40px), чтобы соседние не налезали */
export const PIN_CELL_PX = 64;
/** Потолок меток в кадре: страховка от патологических данных (на телефоне и так ≤ ~60) */
export const MAX_PIN_CLUSTERS = 120;
/** Максимальный зум, до которого кластер имеет смысл «раскрывать» тапом */
export const MAX_PIN_ZOOM = 18;

/** Web Mercator: «мировые пиксели» точки на зуме z (тайл 256px, как CRS.EPSG3857 у Leaflet). */
export function projectMercator(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const clamped = Math.max(-85.0511287798, Math.min(85.0511287798, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export interface PinBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface PinPoint {
  id: string;
  lat: number | null;
  lng: number | null;
}

export interface PinCluster<T extends PinPoint> {
  /** Ключ для React: id фото у одиночки, ячейка сетки у кластера (стабилен при панорамировании) */
  key: string;
  /** Центр кластера — среднее координат его фото */
  lat: number;
  lng: number;
  items: T[];
  /** Фото на обложку метки: первое по порядку входа (вход идёт от новых к старым) */
  cover: T;
}

function inBounds(lat: number, lng: number, b: PinBounds): boolean {
  if (lat < b.south || lat > b.north) return false;
  // west > east — окно пересекает антимеридиан
  return b.west <= b.east ? lng >= b.west && lng <= b.east : lng >= b.west || lng <= b.east;
}

/**
 * Схлопывает фото в метки для текущего вида карты. Фото без координат и вне `bounds`
 * пропускаются; если меток всё равно больше `maxClusters` — остаются самые «густые».
 */
export function clusterPins<T extends PinPoint>(
  photos: readonly T[],
  opts: { zoom: number; cellPx?: number; bounds?: PinBounds | null; maxClusters?: number }
): PinCluster<T>[] {
  const cell = opts.cellPx ?? PIN_CELL_PX;
  const cells = new Map<string, T[]>();

  for (const p of photos) {
    if (p.lat == null || p.lng == null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (opts.bounds && !inBounds(p.lat, p.lng, opts.bounds)) continue;
    const { x, y } = projectMercator(p.lat, p.lng, opts.zoom);
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }

  const out: PinCluster<T>[] = [];
  for (const [key, items] of cells) {
    let lat = 0;
    let lng = 0;
    for (const p of items) {
      lat += p.lat as number;
      lng += p.lng as number;
    }
    out.push({
      key: items.length === 1 ? `p:${items[0].id}` : `c:${key}`,
      lat: lat / items.length,
      lng: lng / items.length,
      items,
      cover: items[0],
    });
  }

  const max = opts.maxClusters ?? MAX_PIN_CLUSTERS;
  if (out.length > max) {
    out.sort((a, b) => b.items.length - a.items.length);
    out.length = max;
  }
  return out;
}

/**
 * Распадётся ли набор фото больше чем на одну метку на данном зуме. Решает, что делает
 * тап по кластеру: приблизить карту (распадётся) или раскрыть список (снято в одной точке —
 * сколько ни зуми, метка не разойдётся).
 */
export function splitsAtZoom<T extends PinPoint>(items: readonly T[], zoom: number, cellPx = PIN_CELL_PX): boolean {
  return clusterPins(items, { zoom, cellPx, maxClusters: Infinity }).length > 1;
}
