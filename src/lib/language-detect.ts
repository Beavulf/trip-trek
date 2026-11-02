// Shared helper для определения языка фразы по тексту.
// Используется в phrasebook.tsx для TTS и Google Translate.
// P1 #5: Google Translate sl не хардкод zh-CN — определяем по скрипту.
// P1 #6: TTS fallback en/auto для латиницы (раньше дефолт zh-CN → китайский голос для en/fr).

export interface DetectedLang {
  langCode: string; // BCP-47 для TTS (zh-CN, ja-JP, ko-KR, etc.)
  langPrefix: string; // короткий код (zh, ja, ko, etc.)
  translateSl: string; // для Google Translate (zh-CN, ja, ko, etc.)
  langName: string; // русское название
  isLatin: boolean; // латиница (en, fr, de, es, vi, etc.)
}

type LangRow = [bcp47: string, name: string, isLatin: boolean];

// Коды — те же, что Phrase.language и LANG_NAME_TO_CODE в разговорнике
const LANGS: Record<string, LangRow> = {
  zh: ["zh-CN", "китайский", false],
  ja: ["ja-JP", "японский", false],
  ko: ["ko-KR", "корейский", false],
  th: ["th-TH", "тайский", false],
  vi: ["vi-VN", "вьетнамский", true],
  fr: ["fr-FR", "французский", true],
  de: ["de-DE", "немецкий", true],
  es: ["es-ES", "испанский", true],
  en: ["en-US", "английский", true],
  it: ["it-IT", "итальянский", true],
  tr: ["tr-TR", "турецкий", true],
  el: ["el-GR", "греческий", false],
  ka: ["ka-GE", "грузинский", false],
  hy: ["hy-AM", "армянский", false],
  az: ["az-AZ", "азербайджанский", true],
  ar: ["ar-SA", "арабский", false],
  he: ["he-IL", "иврит", false],
  hi: ["hi-IN", "хинди", false],
  id: ["id-ID", "индонезийский", true],
  ms: ["ms-MY", "малайский", true],
  pt: ["pt-PT", "португальский", true],
  nl: ["nl-NL", "нидерландский", true],
  pl: ["pl-PL", "польский", true],
  cs: ["cs-CZ", "чешский", true],
  hu: ["hu-HU", "венгерский", true],
  ro: ["ro-RO", "румынский", true],
  bg: ["bg-BG", "болгарский", false],
  sr: ["sr-RS", "сербский", false],
  hr: ["hr-HR", "хорватский", true],
  sv: ["sv-SE", "шведский", true],
  no: ["nb-NO", "норвежский", true],
  da: ["da-DK", "датский", true],
  fi: ["fi-FI", "финский", true],
  kk: ["kk-KZ", "казахский", false],
  uz: ["uz-UZ", "узбекский", true],
  mn: ["mn-MN", "монгольский", false],
  ky: ["ky-KG", "киргизский", false],
  ne: ["ne-NP", "непальский", false],
  si: ["si-LK", "сингальский", false],
  km: ["km-KH", "кхмерский", false],
  lo: ["lo-LA", "лаосский", false],
  my: ["my-MM", "бирманский", false],
  sw: ["sw-KE", "свахили", true],
  ru: ["ru-RU", "русский", false],
};

function langOf(code: string): DetectedLang {
  const [langCode, langName, isLatin] = LANGS[code];
  return { langCode, langPrefix: code, translateSl: code === "zh" ? "zh-CN" : code, langName, isLatin };
}

// Письменность определяет язык почти однозначно. Японские знаки — раньше иероглифов: они есть и в японском
const BY_SCRIPT: [RegExp, string][] = [
  [/[\u3040-\u30ff]/, "ja"],
  [/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/, "zh"],
  [/[\uac00-\ud7af]/, "ko"],
  [/[\u0e00-\u0e7f]/, "th"],
  [/[\u0e80-\u0eff]/, "lo"],
  [/[\u1780-\u17ff]/, "km"],
  [/[\u1000-\u109f]/, "my"],
  [/[\u0d80-\u0dff]/, "si"],
  [/[\u0900-\u097f]/, "hi"],
  [/[\u10a0-\u10ff]/, "ka"],
  [/[\u0530-\u058f]/, "hy"],
  [/[\u0370-\u03ff\u1f00-\u1fff]/, "el"],
  [/[\u0590-\u05ff]/, "he"],
  [/[\u0600-\u06ff]/, "ar"],
  [/[\u0400-\u04ff]/, "ru"],
];

// Латиница: сначала буквы, которые есть только в одном языке, общие (à, é, ü) — в конце.
// Без кода языка это лишь догадка; у фраз из наборов язык записан, и он важнее (см. detectLanguage)
const BY_LATIN_LETTERS: [RegExp, string][] = [
  [/[șțȘȚ]/, "ro"],
  [/[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợũụủứừửữựỳỵỷỹ]|\bxin ch[àa]o\b/i, "vi"],
  [/[ğışİ]/, "tr"],
  [/[ąćęłńśźż]/i, "pl"],
  [/[řěů]/i, "cs"],
  [/[őű]/i, "hu"],
  [/[ñ¿¡]/i, "es"],
  [/[ãõ]/i, "pt"],
  [/[äöüß]/i, "de"],
  [/[àâçéèêëîïôûùœ]/i, "fr"],
];

function languageFromText(text: string): DetectedLang {
  for (const [re, code] of BY_SCRIPT) if (re.test(text)) return langOf(code);
  for (const [re, code] of BY_LATIN_LETTERS) if (re.test(text)) return langOf(code);
  // Латиница без диакритики — по умолчанию английский (НЕ китайский!)
  // P1 #6: раньше дефолт был zh-CN → китайский голос для en/fr без диакритики
  return { ...langOf("en"), translateSl: "auto" };
}

/**
 * Язык фразы. Записанный код набора важнее текста: «Grazie» или «Merhaba» по буквам не отличить
 * от английского, и фраза читалась чужим голосом. По тексту определяем старые записи без кода.
 */
export function detectLanguage(text: string, code?: string | null): DetectedLang {
  const known = code?.split("-")[0].toLowerCase();
  return known && LANGS[known] ? langOf(known) : languageFromText(text);
}

/** Голос в телефоне может быть записан под старым кодом языка */
const VOICE_ALIASES: Record<string, string[]> = { he: ["iw"], id: ["in"], no: ["nb", "nn"] };

export function voiceMatches(voiceLang: string, lang: DetectedLang): boolean {
  const voice = voiceLang.toLowerCase();
  return [lang.langPrefix, ...(VOICE_ALIASES[lang.langPrefix] ?? [])].some((p) => voice === p || voice.startsWith(`${p}-`) || voice.startsWith(`${p}_`));
}

// Только языки готовых наборов (constants.LANGUAGES): остальные загружаются через ИИ по названию
const BY_DESTINATION: [RegExp, string][] = [
  [/китай|china|тайван|taiwan|гонконг|hong\s?kong|макао|maca[uo]/, "zh"],
  [/япони|japan|токио|tokyo|киото|kyoto|осака|osaka/, "ja"],
  [/корея|кореи|korea|сеул|seoul/, "ko"],
  [/таиланд|тайланд|thailand|пхукет|phuket|бангкок|bangkok/, "th"],
  [/вьетнам|vietnam|ханой|hanoi|нячанг|nha trang/, "vi"],
  [/франци(?!ск)|franc(?!is)|париж|paris|ницц|nice/, "fr"],
  [/германи|german|берлин|berlin|мюнхен|munich|австри|austria|вен[аеуы]\b|vienna/, "de"],
  [/испани|spain|мадрид|madrid|барселон|barcelona|мексик|mexic|аргентин|argentin|колумби|colombia|перу|peru|чили|chile|куб[аеы]\b|cuba/, "es"],
];

/** Стартовый выбор языка в загрузке набора: по направлению поездки, иначе английский */
export function guessPackLanguage(destination: string): string {
  const d = destination.toLowerCase();
  return BY_DESTINATION.find(([re]) => re.test(d))?.[1] ?? "en";
}

// Google Translate URL для фразы
// P1 #5: sl из detectLanguage (раньше хардкод zh-CN)
export function googleTranslateUrl(text: string, code?: string | null): string {
  const lang = detectLanguage(text, code);
  return `https://translate.google.com/?sl=${lang.translateSl}&tl=ru&text=${encodeURIComponent(text)}&op=translate`;
}
