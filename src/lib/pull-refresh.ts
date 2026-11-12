// Pull-to-refresh: чистая машина состояний. Touch-хук (use-pull-to-refresh)
// кормит её дистанциями, она решает фазу и момент однократного тика хаптики.
// Сопротивление: первые 36px — 1:1 (отклик мгновенный), дальше ×0.4 с шапкой
// 120px — за порогом (72) палец физически проезжает ~114px, случайный рывок
// порог не берёт.

export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

export const PULL_THRESHOLD = 72;

const LINEAR = 36;
const CAP = 120;
const DAMP = 0.4;

export function pullDistance(raw: number): number {
  if (raw <= LINEAR) return Math.max(0, raw);
  return Math.min(CAP, LINEAR + (raw - LINEAR) * DAMP);
}

export function pullOnMove(phase: PullPhase, distance: number): { phase: PullPhase; tick: boolean } {
  if (phase === "refreshing") return { phase, tick: false };
  if (distance <= 0) return { phase: "idle", tick: false };
  if (distance >= PULL_THRESHOLD) return { phase: "armed", tick: phase !== "armed" };
  return { phase: "pulling", tick: false };
}

export function pullOnRelease(phase: PullPhase): PullPhase {
  return phase === "armed" ? "refreshing" : phase === "refreshing" ? "refreshing" : "idle";
}
