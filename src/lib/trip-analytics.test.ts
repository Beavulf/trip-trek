import { afterEach, describe, expect, it, vi } from "vitest";
import { trackFirstUserPlaceAdded, trackInviteAccepted, trackTripCreated } from "./trip-analytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acquisition analytics", () => {
  it("tracks trip creation with an allowlisted creation method", () => {
    const ym = vi.fn();
    vi.stubGlobal("window", { ym, ymCounterId: 123 });

    trackTripCreated("template");

    expect(ym).toHaveBeenCalledWith(123, "reachGoal", "trip_created", { creation_method: "template" }, expect.any(Function));
  });

  it("tracks the first user-saved place without trip or place identifiers", () => {
    const ym = vi.fn();
    vi.stubGlobal("window", { ym, ymCounterId: 123 });

    trackFirstUserPlaceAdded();

    expect(ym).toHaveBeenCalledWith(123, "reachGoal", "first_user_place_added", {}, expect.any(Function));
  });

  it("tracks a newly accepted invite without personal or trip data", () => {
    const ym = vi.fn();
    vi.stubGlobal("window", { ym, ymCounterId: 123 });

    trackInviteAccepted();

    expect(ym).toHaveBeenCalledWith(123, "reachGoal", "invite_accepted", {}, expect.any(Function));
  });
});
