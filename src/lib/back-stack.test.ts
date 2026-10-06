import { describe, it, expect, vi, beforeEach } from "vitest";

import { createBackStack, type BackStackHistory, type BackStackEvents } from "./back-stack";

// Фейковая history: записи + курсор, back() планировает popstate задачей
// (как настоящий браузер), «пользователь нажал назад» — userBack().
function fakeHistory() {
  const entries: Array<Record<string, unknown>> = [{ __nextjs: true }];
  const listeners: Array<() => void> = [];
  let pos = 0;

  const h = {
    get state() {
      return entries[pos];
    },
    pushState(state: unknown) {
      entries.length = pos + 1;
      entries.push(state as Record<string, unknown>);
      pos += 1;
    },
    back() {
      if (pos === 0) return;
      pos -= 1;
      setTimeout(() => listeners.forEach((f) => f()), 0);
    },
    userBack() {
      if (pos === 0) return; // выход из приложения — popstate не бывает
      pos -= 1;
      listeners.forEach((f) => f());
    },
    onPopState(cb: () => void) {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    // тестовые хелперы
    at: () => pos,
    count: () => entries.length,
    top: () => entries[pos],
  } satisfies BackStackHistory & BackStackEvents & Record<string, unknown>;

  return h;
}

function setup() {
  const h = fakeHistory();
  const stack = createBackStack(h, h);
  const closed: string[] = [];
  const reg = (name: string) => {
    let off: (() => void) | null = null;
    off = stack.push(() => closed.push(name));
    return () => off?.();
  };
  return { h, closed, reg };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("back-stack", () => {
  it("назад закрывает верхний оверлей и не трогает history снаружи", () => {
    const { h, closed, reg } = setup();
    const closeA = reg("A");
    vi.advanceTimersByTime(0); // отложенный push ушёл в history

    h.userBack();

    expect(closed).toEqual(["A"]);
    expect(h.at()).toBe(0);
    closeA(); // повторный клинап после закрытия — безвреден
    expect(h.at()).toBe(0); // и не двигает history повторно
  });

  it("вложенные оверлеи: каждый «назад» закрывает только верхний", () => {
    const { h, closed, reg } = setup();
    reg("A");
    reg("B");
    vi.advanceTimersByTime(0);

    h.userBack();
    expect(closed).toEqual(["B"]);

    h.userBack();
    expect(closed).toEqual(["B", "A"]);
  });

  it("закрытие через UI вычищает свою запись из history, popstate глотается", () => {
    const { h, closed, reg } = setup();
    const closeA = reg("A");
    vi.advanceTimersByTime(0);

    closeA();
    vi.advanceTimersByTime(0); // клинапный back() долетел

    expect(closed).toEqual([]); // ничей close не дёрнулся
    expect(h.at()).toBe(0); // курсор вернулся на базовую запись
    expect(h.top().__nextjs).toBe(true);
  });

  it("стек пуст — popstate ничего не закрывает (выход из приложения)", () => {
    const { h, closed, reg } = setup();
    const closeA = reg("A");
    vi.advanceTimersByTime(0);
    h.userBack(); // закрыл оверлей
    h.userBack(); // «вышел из приложения»

    expect(closed).toEqual(["A"]);
  });

  it("закрылся раньше отложенного push — запись в history не появляется", () => {
    const { h, reg } = setup();
    const closeA = reg("A");
    closeA(); // без advanceTimersByTime — push ещё не ушёл
    vi.advanceTimersByTime(0);

    expect(h.count()).toBe(1);
  });

  it("гонка «шит закрылся + визард открылся» в одном тике не оставляет мусора", () => {
    const { h, closed, reg } = setup();
    const closeA = reg("A");
    vi.advanceTimersByTime(0); // A в history

    closeA(); // back() клинапа уже в полёте…
    reg("B"); // …и в том же тике открылся визард
    vi.advanceTimersByTime(0); // клинапный popstate глотается, B пушится на базу

    expect(closed).toEqual([]);
    expect(h.count()).toBe(2); // база + запись B, без дублей

    h.userBack();
    expect(closed).toEqual(["B"]);
    expect(h.at()).toBe(0);
  });

  it("запись сохраняет state Next.js и несёт маркер оверлея", () => {
    const { h, reg } = setup();
    reg("A");
    vi.advanceTimersByTime(0);

    expect(h.top().__nextjs).toBe(true);
    expect(h.top().__ttOverlay).toBe(true);
  });
});
