import { describe, expect, it } from "vitest";
import { detectLanguage, googleTranslateUrl, guessPackLanguage, voiceMatches } from "./language-detect";

describe("detectLanguage", () => {
  it.each([
    ["こんにちは", "ja"],
    ["你好", "zh"],
    ["안녕하세요", "ko"],
    ["สวัสดี", "th"],
    ["ສະບາຍດີ", "lo"],
    ["សួស្តី", "km"],
    ["မင်္ဂလာပါ", "my"],
    ["ආයුබෝවන්", "si"],
    ["धन्यवाद", "hi"],
    ["მადლობა", "ka"],
    ["Շնորհակալություն", "hy"],
    ["Ευχαριστώ", "el"],
    ["תודה", "he"],
    ["شكرا", "ar"],
    ["Спасибо", "ru"],
  ])("письменность: %s → %s", (text, code) => {
    expect(detectLanguage(text).langPrefix).toBe(code);
  });

  it.each([
    ["Xin chào", "vi"],
    ["Cảm ơn", "vi"],
    ["Tschüss", "de"],
    ["Straße", "de"],
    ["Teşekkürler", "tr"],
    ["Dziękuję", "pl"],
    ["Děkuji", "cs"],
    ["Köszönöm szépen, ő", "hu"],
    ["Mulțumesc", "ro"],
    ["¿Dónde está?", "es"],
    ["Não", "pt"],
    ["S'il vous plaît", "fr"],
    ["Hello", "en"],
  ])("латиница: %s → %s", (text, code) => {
    expect(detectLanguage(text).langPrefix).toBe(code);
  });

  it("язык набора важнее текста", () => {
    expect(detectLanguage("Grazie", "it")).toMatchObject({ langCode: "it-IT", langName: "итальянский", isLatin: true });
    expect(detectLanguage("Merhaba", "tr").langCode).toBe("tr-TR");
    expect(detectLanguage("Obrigado", "pt").langCode).toBe("pt-PT");
    expect(detectLanguage("Добрый день", "bg").langCode).toBe("bg-BG");
  });

  it("неизвестный код набора не ломает определение по тексту", () => {
    expect(detectLanguage("สวัสดี", "тувинский").langPrefix).toBe("th");
    expect(detectLanguage("Hello", null).translateSl).toBe("auto");
  });

  it("код с регионом понимается", () => {
    expect(detectLanguage("你好", "zh-CN").langCode).toBe("zh-CN");
  });
});

describe("googleTranslateUrl", () => {
  it("берёт язык набора", () => {
    expect(googleTranslateUrl("Grazie", "it")).toContain("sl=it&");
    expect(googleTranslateUrl("你好", "zh")).toContain("sl=zh-CN&");
  });
});

describe("voiceMatches", () => {
  it("находит голос под старым кодом и с подчёркиванием", () => {
    expect(voiceMatches("iw-IL", detectLanguage("תודה"))).toBe(true);
    expect(voiceMatches("in_ID", detectLanguage("Terima kasih", "id"))).toBe(true);
    expect(voiceMatches("nb-NO", detectLanguage("Takk", "no"))).toBe(true);
    expect(voiceMatches("zh_CN", detectLanguage("你好"))).toBe(true);
  });
  it("не путает похожие коды", () => {
    expect(voiceMatches("en-US", detectLanguage("Grazie", "it"))).toBe(false);
    expect(voiceMatches("sv-SE", detectLanguage("Xin chào", "si"))).toBe(false);
  });
});

describe("guessPackLanguage", () => {
  it.each([
    ["Китай", "zh"],
    ["Тайвань", "zh"],
    ["Hong Kong", "zh"],
    ["Macau", "zh"],
    ["Япония", "ja"],
    ["Южная Корея", "ko"],
    ["Таиланд", "th"],
    ["Вьетнам", "vi"],
    ["Франция", "fr"],
    ["Германия", "de"],
    ["Мексика", "es"],
    ["Сан-Франциско", "en"],
    ["San Francisco", "en"],
    ["Италия", "en"],
    ["Unknown", "en"],
  ])("%s → %s", (destination, code) => {
    expect(guessPackLanguage(destination)).toBe(code);
  });
});
