import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpiredLink } from "./expired-link";

describe("ExpiredLink", () => {
  it("объясняет, что срок вышел и что нужно просить продление, без данных поездки", () => {
    const html = renderToStaticMarkup(createElement(ExpiredLink));
    expect(html).toContain("Срок действия ссылки закончился");
    expect(html).toContain("продлить");
  });
});
