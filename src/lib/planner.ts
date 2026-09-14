// Чистая математика ИИ-планировщика: контракты черновиков, строгая валидация
// ответа LLM, санитайзер пользовательского текста для промптов.
// Без db/Next — всё покрывается юнит-тестами. Роут — api/ai/planner.
import { CATEGORY_META } from "./types";
import { TIME_SLOTS } from "./time-of-day";

/** Категории мест, на которые ИИ имеет право мапить свои предложения. */
export const PLANNER_CATEGORIES = Object.keys(CATEGORY_META);
/** Слоты времени — ключи канонического time-of-day. */
export const PLANNER_TIME_SLOTS = TIME_SLOTS.map((s) => s.key);

export interface PlannerPlaceDraft {
  /** Имя на русском — так место покажется в поездке. */
  name: string;
  /** Английское/местное имя — им геокодит Nominatim (русские имена китайских POI не находит). */
  nameEn: string | null;
  category: string;
  timeOfDay: string | null;
  /** Одна строка «почему это место вам подойдёт» — материал для карточки черновика. */
  why: string;
  /** Ориентир бюджета порядком («$», «$$», «$$$»), не точная цена. */
  budgetHint: string | null;
  /** Подсказка адреса/района от ИИ — помогает геокодингу, юзеру не показывается как факт. */
  addressHint: string | null;
  /** Заполняется геокодингом на сервере; "fail" → место помечено «уточнить на карте». */
  geoConfidence: "exact" | "approx" | "fail";
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface PlannerDayDraft {
  dayNumber: number;
  places: PlannerPlaceDraft[];
}

export interface PlannerRequest {
  mode: "trip" | "day";
  /** Для mode:"day" — номер дня, который наполняем. */
  dayNumber?: number;
  city?: string;
  interests: string[];
  pace: "relaxed" | "packed" | null;
  budget: "low" | "medium" | "any" | null;
  /** Свободный текст юзера — идёт в промпт только через sanitizeUserText. */
  notes: string;
  /** Имена уже существующих/предложенных мест — не предлагать их и близкие. */
  exclude: string[];
}

export interface PlannerLimits {
  maxTotal: number;
  maxPerDay: number;
}

export const PLANNER_LIMITS: PlannerLimits = {
  maxTotal: 20,
  maxPerDay: 6,
};

/** Лимиты мест: вся поездка — скромнее, чем у одного дня на место. */
export function limitsFor(mode: PlannerRequest["mode"]): PlannerLimits {
  return mode === "day" ? { maxTotal: PLANNER_LIMITS.maxPerDay, maxPerDay: PLANNER_LIMITS.maxPerDay } : PLANNER_LIMITS;
}

/**
 * Санитайзер свободного текста юзера перед вставкой в промпт:
 * markdown-ссылки нейтрализуем (плантинг ссылок доезжал до промпта — аудит
 * 2026-09-12), управляющие символы выкидываем, длину режем.
 */
export function sanitizeUserText(raw: string, cap = 300): string {
  return raw
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function str(v: unknown, cap: number): string {
  return typeof v === "string" ? v.trim().slice(0, cap) : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Строгая валидация ответа LLM. Всё, что не вписывается в контракт
 * (категории/слоты — из канонических списков, дни — существующие, лимиты),
 * отбрасывается молча: частично хороший ответ лучше ошибки.
 */
export function validatePlannerResponse(
  raw: unknown,
  opts: { allowedDayNumbers: number[]; limits: PlannerLimits; exclude: string[] }
): PlannerDayDraft[] {
  if (!isObj(raw)) return [];
  const daysRaw = raw.days;
  if (!Array.isArray(daysRaw)) return [];

  const allowedDays = new Set(opts.allowedDayNumbers);
  const exclude = opts.exclude.map((s) => normalizeName(s)).filter(Boolean);
  const out: PlannerDayDraft[] = [];
  let total = 0;

  for (const d of daysRaw) {
    if (total >= opts.limits.maxTotal) break;
    if (!isObj(d)) continue;
    const dayNumber = num(d.dayNumber);
    if (dayNumber === null || !allowedDays.has(dayNumber)) continue;
    if (!Array.isArray(d.places)) continue;

    const dayDraft: PlannerDayDraft = { dayNumber, places: [] };
    for (const p of d.places) {
      if (dayDraft.places.length >= opts.limits.maxPerDay || total >= opts.limits.maxTotal) break;
      const draft = validatePlace(p, exclude);
      if (!draft) continue;
      dayDraft.places.push(draft);
      total += 1;
    }
    if (dayDraft.places.length > 0) out.push(dayDraft);
  }
  return out;
}

function validatePlace(p: unknown, exclude: string[]): PlannerPlaceDraft | null {
  if (!isObj(p)) return null;
  const name = str(p.name, 200);
  if (name.length < 2) return null;
  // дедуп против существующих мест и уже предложенных (нормализованное сравнение)
  const norm = normalizeName(name);
  if (exclude.some((e) => e === norm || e.includes(norm) || norm.includes(e))) return null;

  const categoryRaw = str(p.category, 50);
  const category = PLANNER_CATEGORIES.includes(categoryRaw) ? categoryRaw : "sight";

  const timeRaw = str(p.timeOfDay, 20);
  const timeOfDay = PLANNER_TIME_SLOTS.includes(timeRaw) ? timeRaw : null;

  const budgetRaw = str(p.budgetHint, 8);
  const why = str(p.why, 200);
  if (!why) return null; // «почему» — обязательная часть карточки черновика

  return {
    name,
    nameEn: str(p.nameEn, 200) || null,
    category,
    timeOfDay,
    why,
    budgetHint: ["$", "$$", "$$$"].includes(budgetRaw) ? budgetRaw : null,
    addressHint: str(p.addressHint, 200) || null,
    geoConfidence: "fail",
    lat: null,
    lng: null,
    address: null,
  };
}

/** Нормализация имени для дедупликации: без пунктуации/регистра («大雁塔» == «大雁塔?»). */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Достать JSON из ответа LLM: срезаем ```-обёртки, берём span {…} или […],
 * прощаем висячие запятые (частая болезнь совместимых моделей).
 * null = ответ вообще не похож на JSON.
 */
export function extractJsonLoose(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  const start = arrStart !== -1 && (objStart === -1 || arrStart < objStart) ? arrStart : objStart;
  if (start === -1) return null;
  const close = cleaned[start] === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return null;
  const body = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
