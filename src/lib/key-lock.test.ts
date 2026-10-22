import { describe, it, expect } from "vitest";

import { withKeyLock } from "./key-lock";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withKeyLock", () => {
  it("задачи с одним ключом идут строго по очереди", async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await tick(ms);
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      withKeyLock("k", task("a", 20)),
      withKeyLock("k", task("b", 1)),
      withKeyLock("k", task("c", 1)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("разные ключи не ждут друг друга", async () => {
    const log: string[] = [];
    await Promise.all([
      withKeyLock("x", async () => {
        await tick(20);
        log.push("x");
      }),
      withKeyLock("y", async () => {
        log.push("y");
      }),
    ]);
    expect(log).toEqual(["y", "x"]);
  });

  it("ошибка задачи не ломает очередь и не утекает следующему", async () => {
    const failing = withKeyLock("k", async () => {
      throw new Error("boom");
    });
    const next = withKeyLock("k", async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("после завершения ключ не копится в памяти", async () => {
    await withKeyLock("tmp", async () => 1);
    // повторный вход с тем же ключом стартует сразу, без ожидания старого хвоста
    const t0 = Date.now();
    await withKeyLock("tmp", async () => 2);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
