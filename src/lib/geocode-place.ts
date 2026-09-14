import { fetchJson } from "./outbound";
import { normalizeName } from "./planner";

// Прямой геокодинг имён мест для черновиков планера (Nominatim /search).
// Политика Nominatim: ~1 запрос/сек с одного IP — поэтому троттлинг 1.1с
// между запросами и суточный кэш outbound (одинаковые предложения городов
// повторяются). Уверенность: exact — чёткий POI-класс, approx — нашлось,
// но по классу не похоже на место; fail — не нашлось («уточнить на карте»).

export interface GeoResult {
  confidence: "exact" | "approx" | "fail";
  lat: number | null;
  lng: number | null;
  address: string | null;
}

const POI_CLASSES = new Set([
  "tourism",
  "historic",
  "leisure",
  "amenity",
  "shop",
  "natural",
  "man_made",
]);

let lastRequestAt = 0;

/** Вежливый троттлинг: не чаще раза в 1.1с (политика Nominatim). */
async function politeDelay(): Promise<void> {
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

interface NominatimHit {
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  display_name?: string;
  importance?: number;
}

/** Геокодировать одно место. null-координаты = fail (место остаётся черновиком «уточнить на карте»). */
export async function geocodePlace(name: string, cityContext: string | null): Promise<GeoResult> {
  const city = cityContext?.trim();
  const q = city && city.length > 0 ? `${name.trim()}, ${city}` : name.trim();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=ru`;

  await politeDelay();
  const hits = await fetchJson<NominatimHit[]>(url, { cacheSec: 86_400, timeoutMs: 8000 });
  const hit = Array.isArray(hits) ? hits[0] : undefined;
  const lat = hit?.lat ? parseFloat(hit.lat) : NaN;
  const lng = hit?.lon ? parseFloat(hit.lon) : NaN;
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { confidence: "fail", lat: null, lng: null, address: null };
  }

  // «Точность»: класс POI (tourism/historic/leisure…) — это место; прочее (улицы,
  // административные границы) — Approx: координаты даём, но помечаем для проверки.
  const confidence = hit.class && POI_CLASSES.has(hit.class) ? "exact" : "approx";
  return {
    confidence,
    lat,
    lng,
    address: hit.display_name ? hit.display_name.split(",").slice(0, 3).join(",").trim() : null,
  };
}

/** Геокодировать черновики последовательно (троттлинг внутри); пишем результат на месте.
 * Бюджет времени страхует роут от минутного зависания на медленном Nominatim:
 * не успевшие места остаются "fail" — черновик честно пометит их «уточнить на карте». */
export async function geocodeDrafts(
  drafts: {
    name: string;
    nameEn: string | null;
    addressHint: string | null;
    geoConfidence: GeoResult["confidence"];
    lat: number | null;
    lng: number | null;
    address: string | null;
  }[],
  cityContext: string | null,
  budgetMs = 45_000
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  const done = new Set<string>();
  for (const d of drafts) {
    if (Date.now() > deadline) return;
    // Ищем по английскому/местному имени (nameEn): русские названия иностранных
    // POI Nominatim не находит. Основной запрос — имя + город; подсказка — второй шанс.
    const geoName = (d.nameEn || d.name).trim();
    // Разделитель \u0000: normalizeName вырезает печатную пунктуацию, «|» склеивал бы ключи
    const key = normalizeName(d.name) + "\u0000" + normalizeName(geoName);
    if (done.has(key)) {
      // дубль имени внутри ответа — копируем гео первого, лишний запрос не тратим
      const twin = drafts.find(
        (x) => normalizeName(x.name) + "\u0000" + normalizeName(x.nameEn || x.name) === key && x.lat !== null
      );
      if (twin) {
        d.geoConfidence = twin.geoConfidence;
        d.lat = twin.lat;
        d.lng = twin.lng;
        d.address = twin.address;
      }
      continue;
    }
    done.add(key);
    let geo = await geocodePlace(geoName, cityContext);
    if (geo.confidence === "fail" && d.addressHint) {
      geo = await geocodePlace(`${geoName}, ${d.addressHint}`, cityContext);
    }
    if (geo.confidence === "fail" && d.nameEn && d.nameEn !== d.name) {
      // последний шанс — русское имя (для domestic-мест иногда срабатывает)
      geo = await geocodePlace(d.name, cityContext);
    }
    d.geoConfidence = geo.confidence;
    d.lat = geo.lat;
    d.lng = geo.lng;
    d.address = geo.address;
  }
}
