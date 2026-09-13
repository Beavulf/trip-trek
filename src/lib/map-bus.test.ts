import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  focusOnMap,
  peekMapFocus,
  ackMapFocus,
  subscribeMapFocus,
  type MapFocusRequest,
} from "./map-bus";

// Модуль с состоянием — каждый тест работает с одной и той же шиной,
// поэтому после каждого кейса подчистим цель.
function cleanup() {
  const p = peekMapFocus();
  if (p) ackMapFocus(p);
}

describe("map-bus", () => {
  beforeEach(() => cleanup());

  it("подписка сразу доставляет ожидающую цель (карта монтируется позже продюсера)", () => {
    const req: MapFocusRequest = { lat: 7, lng: 8, placeId: "early" };
    focusOnMap(req);
    const spy = vi.fn();
    subscribeMapFocus(spy)();
    expect(spy).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it("продюсер кладёт цель, консюмер видит её через peek", () => {
    const req: MapFocusRequest = { lat: 1, lng: 2, placeId: "p1" };
    focusOnMap(req);
    expect(peekMapFocus()).toEqual(req);
    cleanup();
  });

  it("ack снимает ровно свою цель", () => {
    const req: MapFocusRequest = { lat: 1, lng: 2 };
    focusOnMap(req);
    ackMapFocus({ lat: 9, lng: 9 }); // чужая цель не снимает
    expect(peekMapFocus()).toEqual(req);
    ackMapFocus(req);
    expect(peekMapFocus()).toBeNull();
  });

  it("подписчик уведомляется о новой цели, отписка работает", () => {
    const spy = vi.fn();
    const unsub = subscribeMapFocus(spy);
    const req: MapFocusRequest = { lat: 3, lng: 4 };
    focusOnMap(req);
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
    focusOnMap({ lat: 5, lng: 6 });
    expect(spy).toHaveBeenCalledTimes(1); // после отписки — тишина
    cleanup();
  });

  // Регрессия ab2c928: цель не исчезает сама — ждёт консюмера сколько нужно
  it("цель ждёт консюмера, повторный фокус вытесняет старый", () => {
    focusOnMap({ lat: 1, lng: 1, placeId: "a" });
    const newer: MapFocusRequest = { lat: 2, lng: 2, placeId: "b" };
    focusOnMap(newer);
    expect(peekMapFocus()).toEqual(newer);
    cleanup();
  });
});
