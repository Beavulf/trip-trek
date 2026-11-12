import { describe, expect, it } from "vitest";
import { runBulk } from "./photo-bulk";

describe("runBulk", () => {
  it("делит на успешные и упавшие", async () => {
    const r = await runBulk(["a", "b", "c"], async (id) => {
      if (id === "b") throw new Error("403");
    });
    expect(r.done).toEqual(["a", "c"]);
    expect(r.failed).toEqual(["b"]);
  });

  it("держит не больше limit параллельных задач", async () => {
    let inFlight = 0;
    let peak = 0;
    await runBulk(["1", "2", "3", "4", "5"], async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    }, 2);
    expect(peak).toBe(2);
  });

  it("пустой список — пустой результат", async () => {
    expect(await runBulk([], async () => {})).toEqual({ done: [], failed: [] });
  });
});
