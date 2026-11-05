import { describe, expect, it, vi } from "vitest";
import { claimFirstUserPlaceAdded } from "./trip-activation";

describe("claimFirstUserPlaceAdded", () => {
  it("claims the event once for a blank trip with no prior marker", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const now = new Date("2026-11-05T12:00:00.000Z");

    const claimed = await claimFirstUserPlaceAdded({ trip: { updateMany } }, "trip-id", now);

    expect(claimed).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "trip-id", creationSource: "blank", firstUserPlaceAddedAt: null },
      data: { firstUserPlaceAddedAt: now },
    });
  });

  it("does not claim template/import/legacy trips or duplicate claims", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const claimed = await claimFirstUserPlaceAdded({ trip: { updateMany } }, "trip-id");

    expect(claimed).toBe(false);
  });
});
