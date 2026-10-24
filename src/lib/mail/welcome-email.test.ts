import { describe, expect, it } from "vitest";
import { feedbackReplyEmail, welcomeEmail } from "./templates";

describe("welcomeEmail", () => {
  it("с контактом: ссылка на Telegram и подпись в письме", () => {
    const { html } = welcomeEmail("Аня", { href: "https://t.me/bashiKage", label: "@bashiKage" });
    expect(html).toContain('href="https://t.me/bashiKage"');
    expect(html).toContain("@bashiKage");
    expect(html).toContain("Обратная связь");
  });

  it("без контакта: письмо уходит с подсказкой про кнопку в приложении", () => {
    const { html, subject } = welcomeEmail("Аня");
    expect(subject).toMatch(/Добро пожаловать/);
    expect(html).not.toContain("t.me");
    expect(html).toContain("Обратная связь");
  });

  it("имя и контакт экранируются", () => {
    const { html } = welcomeEmail("<b>Аня</b>", { href: 'https://t.me/x"onmouseover="y', label: "<i>@x</i>" });
    expect(html).not.toContain("<b>Аня</b>");
    expect(html).not.toContain("<i>@x</i>");
    expect(html).not.toContain('"onmouseover="');
  });
});

describe("feedbackReplyEmail", () => {
  it("экранирует ответ и цитату, переносы строк сохраняет", () => {
    const { html, subject } = feedbackReplyEmail("Привет\n<script>alert(1)</script>", "Вопрос <b>жирный</b>");
    expect(subject).toMatch(/Ответ/);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Привет<br>");
    expect(html).toContain("&lt;b&gt;жирный&lt;/b&gt;");
  });

  it("длинную цитату обрезает", () => {
    const { html } = feedbackReplyEmail("ок", "я".repeat(500));
    expect(html).toContain("я".repeat(300) + "…");
    expect(html).not.toContain("я".repeat(301));
  });
});
