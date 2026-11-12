import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD, pullDistance, pullOnMove, pullOnRelease } from "./pull-refresh";

describe("pullDistance — нормализация с сопротивлением", () => {
  it("первые 36px один к одному", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(36)).toBe(36);
  });
  it("дальше — затухание ×0.4, шапка 120", () => {
    expect(pullDistance(136)).toBe(76); // 36 + 100*0.4
    expect(pullDistance(336)).toBe(120);
    expect(pullDistance(1000)).toBe(120);
  });
});

describe("pullOnMove", () => {
  it("палец вернулся к краю — idle", () => {
    expect(pullOnMove("pulling", 0)).toEqual({ phase: "idle", tick: false });
  });
  it("тянем — pulling; пересёк порог — armed и tick один раз", () => {
    expect(pullOnMove("idle", 10)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", 30)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", PULL_THRESHOLD + 1)).toEqual({ phase: "armed", tick: true });
    expect(pullOnMove("armed", PULL_THRESHOLD + 20)).toEqual({ phase: "armed", tick: false });
  });
  it("вернулся под порог — снова pulling, повторное пересечение снова тикает", () => {
    expect(pullOnMove("armed", 20)).toEqual({ phase: "pulling", tick: false });
    expect(pullOnMove("pulling", PULL_THRESHOLD + 5)).toEqual({ phase: "armed", tick: true });
  });
  it("во время refreshing движение игнорируется", () => {
    expect(pullOnMove("refreshing", 500)).toEqual({ phase: "refreshing", tick: false });
  });
});

describe("pullOnRelease", () => {
  it("armed → refreshing, иначе — idle; refreshing не трогаем", () => {
    expect(pullOnRelease("armed")).toBe("refreshing");
    expect(pullOnRelease("pulling")).toBe("idle");
    expect(pullOnRelease("idle")).toBe("idle");
    expect(pullOnRelease("refreshing")).toBe("refreshing");
  });
});
