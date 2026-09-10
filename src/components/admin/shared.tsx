"use client";

import { cn } from "@/lib/utils";

// === Общий язык админки: ведомственные штампы и «учётные» метаданные ===

export type FeedbackStatus = "new" | "in_progress" | "resolved";
export type FeedbackType = "bug" | "idea" | "question";

/** Цвета как в паспорте: янтарь — необработано, небо — в работе, зелень — решено */
export const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  new: { label: "Новый", color: "#f59e0b" },
  in_progress: { label: "В работе", color: "#0ea5e9" },
  resolved: { label: "Решён", color: "#10b981" },
};

export const TYPE_META: Record<FeedbackType, { emoji: string; label: string }> = {
  bug: { emoji: "🐞", label: "Баг" },
  idea: { emoji: "💡", label: "Идея" },
  question: { emoji: "❓", label: "Вопрос" },
};

/** Повернутый резиновый штамп — та же пластика, что у печатей в паспорте поездок */
export function Stamp({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 -rotate-6 rounded-[4px] border-2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] leading-tight select-none",
        className
      )}
      style={{ color, borderColor: color, background: `${color}12` }}
    >
      {label}
    </span>
  );
}

export function StatusStamp({ status }: { status: FeedbackStatus }) {
  const meta = STATUS_META[status];
  return <Stamp label={meta.label} color={meta.color} />;
}

/** Относительное время («5 мин назад») — локальный хелпер в духе journal/timeline */
export function relTime(ts: string | Date): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "час" : h < 5 ? "часа" : "часов"} назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

export function fmtDateTime(ts: string | Date): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
