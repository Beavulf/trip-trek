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

// Определяем язык по символам текста
export function detectLanguage(text: string): DetectedLang {
  // Японские: хирагана/катакана
  if (/[\u3040-\u30ff]/.test(text)) {
    return { langCode: "ja-JP", langPrefix: "ja", translateSl: "ja", langName: "японский", isLatin: false };
  }
  // Китайские иероглифы (после проверки на японские)
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) {
    return { langCode: "zh-CN", langPrefix: "zh", translateSl: "zh-CN", langName: "китайский", isLatin: false };
  }
  // Корейские
  if (/[\uac00-\ud7af]/.test(text)) {
    return { langCode: "ko-KR", langPrefix: "ko", translateSl: "ko", langName: "корейский", isLatin: false };
  }
  // Тайские
  if (/[\u0e00-\u0e7f]/.test(text)) {
    return { langCode: "th-TH", langPrefix: "th", translateSl: "th", langName: "тайский", isLatin: false };
  }
  // Арабские
  if (/[\u0600-\u06ff]/.test(text)) {
    return { langCode: "ar-SA", langPrefix: "ar", translateSl: "ar", langName: "арабский", isLatin: false };
  }
  // Кириллица
  if (/[\u0400-\u04ff]/.test(text)) {
    return { langCode: "ru-RU", langPrefix: "ru", translateSl: "ru", langName: "русский", isLatin: false };
  }
  // Латиница с диакритикой — французский
  if (/[àâäçéèêëîïôûùü]/i.test(text)) {
    return { langCode: "fr-FR", langPrefix: "fr", translateSl: "fr", langName: "французский", isLatin: true };
  }
  // Немецкий
  if (/[äöüß]/i.test(text)) {
    return { langCode: "de-DE", langPrefix: "de", translateSl: "de", langName: "немецкий", isLatin: true };
  }
  // Испанский
  if (/[ñ¿¡]/i.test(text)) {
    return { langCode: "es-ES", langPrefix: "es", translateSl: "es", langName: "испанский", isLatin: true };
  }
  // Вьетнамский (латиница с диакритикой)
  if (/[ăâđêôơưàảãạầẩẫậềểễệềểễệồổỗộờởỡợùủũụừửữự]/i.test(text)) {
    return { langCode: "vi-VN", langPrefix: "vi", translateSl: "vi", langName: "вьетнамский", isLatin: true };
  }
  // Латиница без диакритики — по умолчанию английский (НЕ китайский!)
  // P1 #6: раньше дефолт был zh-CN → китайский голос для en/fr без диакритики
  return { langCode: "en-US", langPrefix: "en", translateSl: "auto", langName: "английский", isLatin: true };
}

// Google Translate URL для фразы
// P1 #5: sl из detectLanguage (раньше хардкод zh-CN)
export function googleTranslateUrl(text: string): string {
  const lang = detectLanguage(text);
  return `https://translate.google.com/?sl=${lang.translateSl}&tl=ru&text=${encodeURIComponent(text)}&op=translate`;
}
