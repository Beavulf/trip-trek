"use client";

// Справочники страницы «Фразы»: разделы и языки пакетов.

export const CATEGORIES: Array<{ key: string; label: string; emoji: string; color: string }> = [
  { key: "all", label: "Все", emoji: "✨", color: "#94a3b8" },
  { key: "basics", label: "Основы", emoji: "💬", color: "#06b6d4" },
  { key: "food", label: "Еда", emoji: "🍜", color: "#f97316" },
  { key: "transport", label: "Транспорт", emoji: "🚇", color: "#0ea5e9" },
  { key: "shopping", label: "Покупки", emoji: "🛍️", color: "#8b5cf6" },
  { key: "emergency", label: "Экстренные", emoji: "🚨", color: "#ef4444" },
  { key: "social", label: "Общение", emoji: "🤝", color: "#10b981" },
];

export const BROWSE_CATEGORIES = CATEGORIES.filter((c) => c.key !== "all");

export function categoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key);
}

// Языки, для которых есть готовые пакеты (POST /api/phrases/generate)
export const LANGUAGES: Array<{ code: string; label: string; emoji: string }> = [
  { code: "zh", label: "Китайский", emoji: "🇨🇳" },
  { code: "ja", label: "Японский", emoji: "🇯🇵" },
  { code: "ko", label: "Корейский", emoji: "🇰🇷" },
  { code: "th", label: "Тайский", emoji: "🇹🇭" },
  { code: "vi", label: "Вьетнамский", emoji: "🇻🇳" },
  { code: "fr", label: "Французский", emoji: "🇫🇷" },
  { code: "de", label: "Немецкий", emoji: "🇩🇪" },
  { code: "es", label: "Испанский", emoji: "🇪🇸" },
  { code: "en", label: "Английский", emoji: "🇬🇧" },
];

// Русское имя языка → код (для «Другой язык через ИИ» и бейджей на карточках)
const LANG_NAME_TO_CODE: Record<string, string> = {
  "китайский": "zh", "японский": "ja", "корейский": "ko", "тайский": "th",
  "вьетнамский": "vi", "французский": "fr", "немецкий": "de", "испанский": "es",
  "английский": "en", "итальянский": "it", "турецкий": "tr", "греческий": "el",
  "грузинский": "ka", "армянский": "hy", "азербайджанский": "az", "арабский": "ar",
  "иврит": "he", "хинди": "hi", "индонезийский": "id", "малайский": "ms",
  "португальский": "pt", "нидерландский": "nl", "голландский": "nl", "польский": "pl",
  "чешский": "cs", "венгерский": "hu", "румынский": "ro", "болгарский": "bg",
  "сербский": "sr", "хорватский": "hr", "шведский": "sv", "норвежский": "no",
  "датский": "da", "финский": "fi", "казахский": "kk", "узбекский": "uz",
  "монгольский": "mn", "киргизский": "ky", "непальский": "ne", "сингальский": "si",
  "кхмерский": "km", "лаосский": "lo", "бирманский": "my", "свахили": "sw",
};

/** «Грузинский» → код для хранения/бейджа; неизвестное имя — стабильный ключ из самого имени */
export function codeFromLangName(name: string): { code: string; known: boolean } {
  const key = name.trim().toLowerCase();
  const code = LANG_NAME_TO_CODE[key];
  if (code) return { code, known: true };
  const fallback = key.replace(/[^a-zа-яё]/g, "").slice(0, 12);
  return { code: fallback || "xx", known: false };
}

export function getLangEmoji(prefix: string): string {
  const map: Record<string, string> = {
    zh: "🀄", ja: "🎌", ko: "🇰🇷", th: "🇹🇭", vi: "🇻🇳",
    fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", en: "🇬🇧", ar: "🇸🇦", ru: "🇷🇺",
  };
  return map[prefix] || "💬";
}

/** Код языка → флажок для бейджа на карточке (null — нет в словаре, не рисуем) */
export function langBadge(code?: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    zh: "🀄", ja: "🎌", ko: "🇰🇷", th: "🇹🇭", vi: "🇻🇳", fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", en: "🇬🇧",
    it: "🇮🇹", tr: "🇹🇷", el: "🇬🇷", ka: "🇬🇪", hy: "🇦🇲", az: "🇦🇿", ar: "🇸🇦", he: "🇮🇱", hi: "🇮🇳",
    id: "🇮🇩", ms: "🇲🇾", pt: "🇵🇹", nl: "🇳🇱", pl: "🇵🇱", cs: "🇨🇿", hu: "🇭🇺", ro: "🇷🇴", bg: "🇧🇬",
    sr: "🇷🇸", hr: "🇭🇷", sv: "🇸🇪", no: "🇳🇴", da: "🇩🇰", fi: "🇫🇮", kk: "🇰🇿", uz: "🇺🇿", mn: "🇲🇳",
    ky: "🇰🇬", ne: "🇳🇵", si: "🇱🇰", km: "🇰🇭", lo: "🇱🇦", my: "🇲🇲", sw: "🇰🇪",
  };
  return map[code] ?? null;
}

// Название транскрипции по письму: пиньинь / ромадзи / просто транскрипция
export function pronunciationLabel(prefix: string): string {
  if (prefix === "zh") return "Пиньинь";
  if (prefix === "ja") return "Ромадзи";
  return "Транскрипция";
}
