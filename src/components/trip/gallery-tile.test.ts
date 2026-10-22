import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Photo } from "@/lib/types";
import { CompactTile, MasonryTile } from "./gallery-tile";

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "p1",
  url: "/uploads/a.jpg",
  thumbUrl: "/uploads/a-thumb.jpg",
  caption: null,
  isFavorite: false,
  placeId: null,
  dayId: "d1",
  userId: null,
  user: null,
  place: null,
  day: { dayNumber: 3, city: "Гуанчжоу", cityKey: "gz" },
  lat: null,
  lng: null,
  address: null,
  takenAt: "2026-10-01T10:00:00.000Z",
  ...over,
});

const masonry = (p: Photo, animate = false) =>
  renderToStaticMarkup(createElement(MasonryTile, { photo: p, index: 0, animate, onOpen: () => {} }));

describe("MasonryTile", () => {
  it("с размерами из БД резервирует место под картинку: aspect-ratio и без заглушки 120px", () => {
    const html = masonry(photo({ width: 1200, height: 1600 }));
    expect(html).toContain("aspect-ratio:1200 / 1600");
    expect(html).not.toContain("min-h-[120px]\"");
    // заглушка-фолбэк «Не удалось показать фото» не должна подмешивать min-h в саму картинку
    expect(html.match(/<img[^>]*>/)![0]).not.toContain("min-h-[120px]");
  });

  it("у старого фото без размеров остаётся заглушка 120px (как раньше)", () => {
    const img = masonry(photo()).match(/<img[^>]*>/)![0];
    expect(img).toContain("min-h-[120px]");
    expect(img).not.toContain("aspect-ratio");
  });

  it("грузит миниатюру лениво и декодирует вне основного потока", () => {
    const img = masonry(photo()).match(/<img[^>]*>/)![0];
    expect(img).toContain('src="/uploads/a-thumb.jpg"');
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
  });

  it("нет миниатюры — показывает оригинал", () => {
    expect(masonry(photo({ thumbUrl: null }))).toContain('src="/uploads/a.jpg"');
  });

  it("анимация входа только у animate: иначе обычная кнопка без motion-стилей", () => {
    expect(masonry(photo(), true)).toContain("opacity:0");
    expect(masonry(photo(), false)).not.toContain("opacity:0");
  });

  it("подпись дня и города на плитке", () => {
    expect(masonry(photo())).toContain("День 3");
    expect(masonry(photo())).toContain("Гуанчжоу");
  });
});

describe("CompactTile", () => {
  it("квадратная плитка с ленивой миниатюрой", () => {
    const html = renderToStaticMarkup(createElement(CompactTile, { photo: photo(), index: 2, onOpen: () => {} }));
    expect(html).toContain("aspect-square");
    const img = html.match(/<img[^>]*>/)![0];
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
  });
});
