"use client";

/** Кольцо прогресса 0..1; цвет берёт у родителя (currentColor). */
export function ProgressRing({ value, className }: { value: number; className?: string }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-6"} aria-hidden="true">
      <g transform="rotate(-90 12 12)" fill="none" strokeWidth="3" strokeLinecap="round">
        <circle cx="12" cy="12" r={r} stroke="currentColor" strokeOpacity="0.2" />
        <circle
          cx="12"
          cy="12"
          r={r}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </g>
    </svg>
  );
}
