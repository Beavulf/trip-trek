import { describe, expect, it } from "vitest";
import { welcomeEmail } from "./templates";

describe("welcomeEmail", () => {
  it("с контактом: ссылка на Telegram и подпись в письме", () => {
    const { html } = welcomeEmail("Аня", { href: "https://t.me/bashiKage", label: "@bashiKage" });
    expect(html).toContain('href="https://t.me/bashiKage"');
    expect(html).toContain("@bashiKage");
    expect(html).toContain("Сообщить о проблеме");
  });

  it("без контакта: письмо уходит с подсказкой про кнопку в приложении", () => {
    const { html, subject } = welcomeEmail("Аня");
    expect(subject).toMatch(/Добро пожаловать/);
    expect(html).not.toContain("t.me");
    expect(html).toContain("Сообщить о проблеме");
  });

  it("имя и контакт экранируются", () => {
    const { html } = welcomeEmail("<b>Аня</b>", { href: 'https://t.me/x"onmouseover="y', label: "<i>@x</i>" });
    expect(html).not.toContain("<b>Аня</b>");
    expect(html).not.toContain("<i>@x</i>");
    expect(html).not.toContain('"onmouseover="');
  });
});
