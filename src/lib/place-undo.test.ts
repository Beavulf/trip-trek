import { describe, expect, it } from "vitest";
import { placeRestorePayload } from "./place-undo";

const place = {
  id: "p1",
  name: "Canton Tower",
  description: "Телебашня",
  category: "sight",
  lat: 23.1066,
  lng: 113.3245,
  timeOfDay: "evening",
  budget: 20,
  address: "Yuejiang W Rd",
  notes: "",
  rating: null,
  status: "planned",
  visitedAt: null,
  dayId: "d2",
  tripId: "t1",
} as any;

describe("placeRestorePayload", () => {
  it("только поля PLACE_PATCHABLE, присутствующие в объекте", () => {
    const p = placeRestorePayload(place);
    expect(p).toEqual({
      name: "Canton Tower",
      description: "Телебашня",
      category: "sight",
      lat: 23.1066,
      lng: 113.3245,
      timeOfDay: "evening",
      budget: 20,
      address: "Yuejiang W Rd",
      notes: "",
      rating: null,
      status: "planned",
      visitedAt: null,
      dayId: "d2",
    });
  });

  it("лишние поля (id/tripId/прочее) не попадают", () => {
    const p = placeRestorePayload({ ...place, id: "p1", tripId: "t1", photos: [] });
    expect(p).not.toHaveProperty("id");
    expect(p).not.toHaveProperty("tripId");
    expect(p).not.toHaveProperty("photos");
  });
});
