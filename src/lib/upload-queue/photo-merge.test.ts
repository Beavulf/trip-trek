import { describe, it, expect } from "vitest";

import type { Photo } from "@/lib/types";
import { isPhotoLike, mergePhotos, photosKeyAccepts } from "./photo-merge";

const photo = (id: string, takenAt: string, dayId = "d1"): Photo => ({
  id, url: `/uploads/${id}.jpg`, thumbUrl: null, caption: null, isFavorite: false, placeId: null, dayId,
  userId: "u1", user: null, place: null, day: null, lat: null, lng: null, address: null, takenAt,
});

describe("isPhotoLike", () => {
  it("принимает строку Photo и отбрасывает мусор", () => {
    expect(isPhotoLike(photo("a", "2026-10-01T10:00:00Z"))).toBe(true);
    expect(isPhotoLike(null)).toBe(false);
    expect(isPhotoLike({})).toBe(false);
    expect(isPhotoLike({ id: "a", url: "x" })).toBe(false);
  });
});

describe("photosKeyAccepts", () => {
  it("общий список поездки и список своего дня — да, чужой день и фильтр по месту — нет", () => {
    const p = photo("a", "2026-10-01T10:00:00Z", "d1");
    expect(photosKeyAccepts(["photos", "t1", undefined, undefined], "t1", p)).toBe(true);
    expect(photosKeyAccepts(["photos", "t1", "d1", undefined], "t1", p)).toBe(true);
    expect(photosKeyAccepts(["photos", "t1", "d2", undefined], "t1", p)).toBe(false);
    expect(photosKeyAccepts(["photos", "t1", undefined, "place"], "t1", p)).toBe(false);
    expect(photosKeyAccepts(["photos", "t2", undefined, undefined], "t1", p)).toBe(false);
    expect(photosKeyAccepts(["photos-geo", "t1"], "t1", p)).toBe(false);
  });
});

describe("mergePhotos", () => {
  it("вставляет новые по takenAt (новые сверху), не трогая порядок остальных", () => {
    const existing = [photo("b", "2026-10-03T10:00:00Z"), photo("c", "2026-10-01T10:00:00Z")];
    const out = mergePhotos(existing, [photo("n", "2026-10-02T10:00:00Z")]);
    expect(out.map((p) => p.id)).toEqual(["b", "n", "c"]);
  });

  it("не дублирует то, что уже пришло рефетчем, и возвращает тот же массив, если добавлять нечего", () => {
    const existing = [photo("b", "2026-10-03T10:00:00Z")];
    expect(mergePhotos(existing, [photo("b", "2026-10-03T10:00:00Z")])).toBe(existing);
  });

  it("пустой список принимает пачку целиком", () => {
    const out = mergePhotos([], [photo("a", "2026-10-01T10:00:00Z"), photo("b", "2026-10-02T10:00:00Z")]);
    expect(out.map((p) => p.id)).toEqual(["b", "a"]);
  });
});
