"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Crown,
  HardDrive,
  KeyRound,
  MessageSquare,
  Pencil,
  RefreshCw,
  Reply,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// === Общий язык админки: ведомственные штампы и «учётные» метаданные ===

export type FeedbackStatus = "new" | "in_progress" | "resolved";
export type FeedbackType = "bug" | "idea" | "question";
export type TripStatus = "planning" | "active" | "completed";

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

export const TRIP_STATUS_META: Record<TripStatus, { label: string; color: string }> = {
  planning: { label: "Планируется", color: "#0ea5e9" },
  active: { label: "В пути", color: "#10b981" },
  completed: { label: "Завершена", color: "#94a3b8" },
};

/** Секционные акценты админки — по одному цвету на раздел навигации */
export const SECTION_COLOR = {
  overview: "#f97316",
  users: "#0ea5e9",
  trips: "#f59e0b",
  feedback: "#f43f5e",
  journal: "#10b981",
  settings: "#8b5cf6",
} as const;

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

export function TripStatusStamp({ status }: { status: string }) {
  const meta = TRIP_STATUS_META[(status as TripStatus) in TRIP_STATUS_META ? (status as TripStatus) : "planning"];
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

/** Байты в человекочитаемый вид: 1.2 МБ */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Цифра табло: при смене значения «перещёлкивается», как табличка на вокзале */
export function FlipNumber({ value, className }: { value: number | string; className?: string }) {
  const text = String(value);
  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0, position: "absolute" }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          className="inline-block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Пустое состояние секции */
export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="py-14 text-center space-y-2">
      <div className="text-4xl">{emoji}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// === Журнал действий: названия и иконки для каждого action ===

export const ACTION_META: Record<string, { label: string; icon: typeof Pencil; danger?: boolean }> = {
  "user.premium": { label: "Premium изменён", icon: Crown },
  "user.role": { label: "Роль изменена", icon: ShieldCheck },
  "user.edit": { label: "Профиль изменён", icon: Pencil },
  "user.password": { label: "Пароль сброшен", icon: KeyRound },
  "user.delete": { label: "Пользователь удалён", icon: Trash2, danger: true },
  "user.message": { label: "Сообщение пользователю", icon: StickyNote },
  "trip.edit": { label: "Поездка изменена", icon: Pencil },
  "trip.delete": { label: "Поездка удалена", icon: Trash2, danger: true },
  "trip.invite_regen": { label: "Код приглашения обновлён", icon: RefreshCw },
  "trip.member_remove": { label: "Участник исключён", icon: UserMinus, danger: true },
  "trip.ban": { label: "Участник заблокирован", icon: ShieldOff, danger: true },
  "trip.unban": { label: "Блокировка снята", icon: ShieldCheck },
  "trip.transfer": { label: "Владение передано", icon: Crown },
  "feedback.status": { label: "Статус отзыва изменён", icon: MessageSquare },
  "feedback.note": { label: "Заметка по отзыву", icon: StickyNote },
  "feedback.reply": { label: "Ответ пользователю", icon: Reply },
  "feedback.delete": { label: "Отзыв удалён", icon: Trash2, danger: true },
  "settings.ai": { label: "Настройки ИИ сохранены", icon: Sparkles },
  "settings.app": { label: "Конфиг приложения изменён", icon: SlidersHorizontal },
  "storage.purge": { label: "Чистка хранилища", icon: HardDrive },
};

export const TARGET_META: Record<string, { label: string; color: string }> = {
  user: { label: "Юзеры", color: SECTION_COLOR.users },
  trip: { label: "Поездки", color: SECTION_COLOR.trips },
  feedback: { label: "Отзывы", color: SECTION_COLOR.feedback },
  settings: { label: "Настройки", color: SECTION_COLOR.settings },
  storage: { label: "Хранилище", color: SECTION_COLOR.journal },
};
