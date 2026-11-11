import { reachGoal } from "@/lib/metrika";

export type TripCreationMethod = "blank" | "custom" | "template" | "import";

export function trackTripCreated(method: TripCreationMethod): void {
  reachGoal("trip_created", undefined, { creation_method: method });
}

export function trackFirstUserPlaceAdded(): void {
  reachGoal("first_user_place_added");
}

export function trackInviteAccepted(): void {
  reachGoal("invite_accepted");
}

export function trackFirstDayAdded(): void {
  reachGoal("first_day_added");
}
