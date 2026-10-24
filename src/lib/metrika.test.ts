import { afterEach, describe, expect, it, vi } from "vitest";
import { reachGoal } from "./metrika";

const setWindow = (w: object | undefined) => {
  if (w === undefined) vi.unstubAllGlobals();
  else vi.stubGlobal("window", w);
};

afterEach(() => {
  vi.useRealTimers();
  setWindow(undefined);
});

describe("reachGoal", () => {
  it("без счётчика сразу вызывает done и ничего не шлёт", () => {
    setWindow({});
    const done = vi.fn();
    reachGoal("signup", done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("на сервере (нет window) не падает", () => {
    const done = vi.fn();
    expect(() => reachGoal("signup", done)).not.toThrow();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("шлёт цель в счётчик и вызывает done, когда Метрика ответила; повторов нет", () => {
    vi.useFakeTimers();
    const ym = vi.fn((_id: number, _m: string, _g: string, _p?: object, cb?: () => void) => cb?.());
    setWindow({ ym, ymCounterId: 12345 });
    const done = vi.fn();
    reachGoal("signup", done);
    expect(ym).toHaveBeenCalledWith(12345, "reachGoal", "signup", {}, expect.any(Function));
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000); // таймер-страховка второй раз done не зовёт
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("если Метрика молчит, done вызывается по таймеру", () => {
    vi.useFakeTimers();
    setWindow({ ym: vi.fn(), ymCounterId: 1 });
    const done = vi.fn();
    reachGoal("signup", done);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("если ym бросает исключение, done всё равно вызывается", () => {
    setWindow({ ym: () => { throw new Error("boom"); }, ymCounterId: 1 });
    const done = vi.fn();
    reachGoal("signup", done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
