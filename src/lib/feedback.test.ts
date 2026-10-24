import { describe, expect, it } from "vitest";
import {
  cleanContextField,
  describeScreen,
  describeUserAgent,
  hasUnreadReply,
  isPlausibleEmail,
  parseFeedbackType,
  parseMessageText,
  screenFromLocation,
  statusAfterMessage,
} from "./feedback";

describe("statusAfterMessage", () => {
  it("юзер дописал — обращение возвращается в очередь админа, даже из закрытых", () => {
    expect(statusAfterMessage("user", "resolved")).toBe("new");
    expect(statusAfterMessage("user", "in_progress")).toBe("new");
    expect(statusAfterMessage("user", "new")).toBe("new");
  });

  it("первый ответ админа переводит «новое» в «в работе», остальное не трогает", () => {
    expect(statusAfterMessage("admin", "new")).toBe("in_progress");
    expect(statusAfterMessage("admin", "in_progress")).toBe("in_progress");
    expect(statusAfterMessage("admin", "resolved")).toBe("resolved");
  });
});

describe("hasUnreadReply", () => {
  it("нет ответа админа — нечего читать", () => {
    expect(hasUnreadReply(null, null)).toBe(false);
  });
  it("ответ есть, обращение не открывали — непрочитано", () => {
    expect(hasUnreadReply("2026-10-24T10:00:00Z", null)).toBe(true);
  });
  it("сравнивает ответ с моментом последнего просмотра", () => {
    expect(hasUnreadReply("2026-10-24T10:00:00Z", "2026-10-24T09:00:00Z")).toBe(true);
    expect(hasUnreadReply("2026-10-24T10:00:00Z", "2026-10-24T11:00:00Z")).toBe(false);
  });
});

describe("parseMessageText", () => {
  it("обрезает пробелы и принимает нормальный текст", () => {
    expect(parseMessageText("  не работает карта  ", 100)).toEqual({ ok: true, message: "не работает карта" });
  });
  it("отбивает пустое и не-строку", () => {
    expect(parseMessageText("   ", 100).ok).toBe(false);
    expect(parseMessageText(null, 100).ok).toBe(false);
    expect(parseMessageText(42, 100).ok).toBe(false);
  });
  it("отбивает слишком длинное с указанием лимита", () => {
    const r = parseMessageText("a".repeat(11), 10);
    expect(r).toEqual({ ok: false, error: "Максимум 10 символов" });
  });
});

describe("parseFeedbackType", () => {
  it("знает все типы и сводит незнакомое к багу", () => {
    expect(parseFeedbackType("review")).toBe("review");
    expect(parseFeedbackType("complaint")).toBe("complaint");
    expect(parseFeedbackType("hack")).toBe("bug");
    expect(parseFeedbackType(undefined)).toBe("bug");
  });
});

describe("isPlausibleEmail", () => {
  it("принимает обычные адреса", () => {
    expect(isPlausibleEmail("a@b.co")).toBe(true);
    expect(isPlausibleEmail(" user.name+tag@mail.example.by ")).toBe(true);
  });
  it("отбивает опечатки и мусор", () => {
    expect(isPlausibleEmail("user@")).toBe(false);
    expect(isPlausibleEmail("user@host")).toBe(false);
    expect(isPlausibleEmail("us er@host.com")).toBe(false);
    expect(isPlausibleEmail("a@b.c")).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
  });
});

describe("cleanContextField", () => {
  it("вычищает управляющие символы и режет длину", () => {
    expect(cleanContextField("a\nb\u0000c", 10)).toBe("abc");
    expect(cleanContextField("x".repeat(50), 5)).toBe("xxxxx");
  });
  it("пустое и не-строка — null", () => {
    expect(cleanContextField("  ", 10)).toBeNull();
    expect(cleanContextField(5, 10)).toBeNull();
  });
});

describe("screenFromLocation / describeScreen", () => {
  it("на главной берёт активную вкладку", () => {
    expect(screenFromLocation("/", "budget")).toBe("budget");
    expect(screenFromLocation("/", null)).toBe("/");
  });
  it("из пути выкидывает длинные идентификаторы", () => {
    expect(screenFromLocation("/split/cmh1abcdefghijklmnop", "budget")).toBe("/split/:id");
    expect(screenFromLocation("/profile", "budget")).toBe("/profile");
  });
  it("описывает вкладку по-русски, путь — как путь", () => {
    expect(describeScreen("budget")).toBe("вкладка «Бюджет»");
    expect(describeScreen("/split/:id")).toBe("страница /split/:id");
    expect(describeScreen(null)).toBeNull();
  });
});

describe("describeUserAgent", () => {
  it("Chrome на Android", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    expect(describeUserAgent(ua)).toBe("Chrome 130 · Android");
  });
  it("Safari на iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(ua)).toBe("Safari 17 · iOS");
  });
  it("Edge не принимает за Chrome, Яндекс — тоже", () => {
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0")
    ).toBe("Edge 129 · Windows");
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0.0.0 YaBrowser/24.9.0 Safari/537.36")
    ).toBe("Яндекс Браузер 24 · Windows");
  });
  it("помечает встроенный браузер TikTok", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/118.0.0.0 Mobile Safari/537.36 musical_ly_33.1.0 BytedanceWebview/d8a21c6";
    expect(describeUserAgent(ua)).toContain("встроенный браузер");
  });
  it("пусто — null", () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent("curl/8.0")).toBeNull();
  });
});
