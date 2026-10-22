import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GalleryUploads } from "./GalleryUploads";
import { ProgressRing } from "./ProgressRing";
import { FabUploadRing, UploadTray } from "./UploadTray";
import { UploadThumb } from "./UploadThumb";

// SSR-смоук: оболочка приложения рендерится на сервере, а очередь — клиентская (IndexedDB,
// object URL). На сервере все её компоненты обязаны отдавать пустой снимок и не падать.
describe("UI очереди загрузки на сервере", () => {
  it("плашка, кольцо FAB и полоса галереи при пустой очереди ничего не рисуют", () => {
    expect(renderToStaticMarkup(createElement(UploadTray))).toBe("");
    expect(renderToStaticMarkup(createElement(FabUploadRing))).toBe("");
    expect(renderToStaticMarkup(createElement(GalleryUploads, { tripId: "t1" }))).toBe("");
  });

  it("превью без блоба — заглушка, без обращения к object URL", () => {
    const html = renderToStaticMarkup(createElement(UploadThumb, { id: "j1", hasThumb: false }));
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("<img");
  });

  it("кольцо прогресса зажимает значение в 0..1", () => {
    const full = renderToStaticMarkup(createElement(ProgressRing, { value: 5 }));
    const none = renderToStaticMarkup(createElement(ProgressRing, { value: -3 }));
    expect(full).toContain('stroke-dashoffset="0"');
    expect(none).toMatch(/stroke-dashoffset="56\.5/);
  });
});
