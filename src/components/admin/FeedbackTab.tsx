"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ExternalLink, Loader2, MessageSquareWarning, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDateTime, relTime, StatusStamp, STATUS_META, TYPE_META, type FeedbackStatus, type FeedbackType } from "./shared";

interface FeedbackRow {
  id: string;
  type: FeedbackType;
  message: string;
  screenshotUrl: string | null;
  status: FeedbackStatus;
  adminNote: string | null;
  adminReply: string | null;
  repliedAt: string | null;
  pageUrl: string | null;
  tripId: string | null;
  userAgent: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; name: string; email: string; emoji: string; color: string } | null;
}

const FILTERS: { value: FeedbackStatus | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "new", label: "Новые" },
  { value: "in_progress", label: "В работе" },
  { value: "resolved", label: "Решённые" },
];

const TYPE_FILTERS: { value: FeedbackType | "all"; label: string }[] = [
  { value: "all", label: "Все типы" },
  { value: "bug", label: "🐞 Баги" },
  { value: "idea", label: "💡 Идеи" },
  { value: "question", label: "❓ Вопросы" },
];

export function FeedbackTab({
  statusFilter,
  onFilterChange,
  counts,
}: {
  statusFilter: FeedbackStatus | "all";
  onFilterChange: (f: FeedbackStatus | "all") => void;
  counts: { new: number; inProgress: number; resolved: number };
}) {
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Строка после PATCH: фильтр «Новые» больше не включает сменённый статус,
  // но шторка должна остаться открытой с актуальными данными
  const [override, setOverride] = useState<FeedbackRow | null>(null);
  const qc = useQueryClient();

  const { data: items, isLoading } = useQuery<FeedbackRow[]>({
    queryKey: ["admin-feedback", statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const r = await fetch(`/api/admin/feedback${params.toString() ? `?${params}` : ""}`);
      if (!r.ok) throw new Error("fetch feedback failed");
      return r.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json as FeedbackRow;
    },
    onSuccess: (updated) => {
      invalidate();
      setOverride(updated);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/feedback?id=${id}`, { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось удалить");
    },
    onSuccess: () => {
      setSelectedId(null);
      setOverride(null);
      invalidate();
      toast.success("Отзыв удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected =
    (override?.id === selectedId ? override : null) || items?.find((f) => f.id === selectedId) || null;
  const countFor = (f: FeedbackStatus | "all") =>
    f === "all"
      ? counts.new + counts.inProgress + counts.resolved
      : f === "new"
        ? counts.new
        : f === "in_progress"
          ? counts.inProgress
          : counts.resolved;

  return (
    <>
      {/* Фильтр статусов + тип */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
          {FILTERS.map((f) => {
            const n = countFor(f.value);
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onFilterChange(f.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 min-h-9 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                {n > 0 && (
                  <span
                    className={cn(
                      "min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                      statusFilter === f.value ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "px-2.5 min-h-8 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                typeFilter === f.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Очередь */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !items?.length ? (
        <div className="py-16 text-center space-y-2">
          <div className="text-4xl">📮</div>
          <p className="text-sm text-muted-foreground">
            {statusFilter === "all" ? "Отзывов пока нет" : "В этой папке пусто"}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((f, i) => {
            const type = TYPE_META[f.type] || TYPE_META.bug;
            return (
              <motion.button
                key={f.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => setSelectedId(f.id)}
                className="w-full text-left rounded-2xl bg-card border border-border p-3.5 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{type.emoji}</span>
                  <span className="text-xs font-semibold">{type.label}</span>
                  <span className="flex-1" />
                  <StatusStamp status={f.status} />
                </div>
                <p className="text-sm mt-1.5 line-clamp-2">{f.message}</p>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-1.5">
                  {f.user ? f.user.name : "аккаунт удалён"} · {relTime(f.createdAt)}
                  {f.screenshotUrl ? " · 📎" : ""}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Разбор отзыва */}
      <MobileBottomSheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) {
            setSelectedId(null);
            setOverride(null);
          }
        }}
        title={selected ? `${TYPE_META[selected.type]?.emoji || "📮"} ${TYPE_META[selected.type]?.label || "Отзыв"}` : ""}
        titleIcon={<MessageSquareWarning className="size-4" />}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm whitespace-pre-wrap">{selected.message}</p>

            {/* Скриншот */}
            {selected.screenshotUrl && (
              <a href={selected.screenshotUrl} target="_blank" rel="noreferrer" className="block relative rounded-2xl overflow-hidden border border-border group">
                <img src={selected.screenshotUrl} alt="Скриншот" className="w-full max-h-64 object-cover" />
                <span className="absolute bottom-2 right-2 size-8 rounded-full bg-black/60 text-white grid place-items-center backdrop-blur group-hover:bg-black/80">
                  <ExternalLink className="size-3.5" />
                </span>
              </a>
            )}

            {/* Контекст — «учётная» строка */}
            <div className="rounded-2xl bg-secondary/50 p-3 space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                от: {selected.user ? `${selected.user.name} · ${selected.user.email}` : "аккаунт удалён"}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                страница: {selected.pageUrl || "—"}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                отправлено: {fmtDateTime(selected.createdAt)}
              </p>
            </div>

            {/* Статус */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">статус</p>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted">
                {(["new", "in_progress", "resolved"] as FeedbackStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: selected.id, status: s })}
                      className={cn(
                        "min-h-10 rounded-xl text-xs font-semibold transition-all disabled:opacity-50",
                        selected.status === s ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
              </div>
              {selected.resolvedAt && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/80 mt-1.5">
                  решён {fmtDateTime(selected.resolvedAt)}
                </p>
              )}
            </div>

            {/* Заметка админа */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
                заметка (видна только админам)
              </p>
              <textarea
                defaultValue={selected.adminNote || ""}
                id={`note-${selected.id}`}
                rows={3}
                maxLength={2000}
                placeholder="Что сделал, что решил…"
                className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
              />
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => {
                  const el = document.getElementById(`note-${selected.id}`) as HTMLTextAreaElement | null;
                  patch.mutate({ id: selected.id, adminNote: el?.value ?? null });
                }}
                className="mt-2 w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {patch.isPending ? <Loader2 className="size-4 animate-spin inline" /> : "Сохранить заметку"}
              </button>
            </div>

            {/* Ответ пользователю */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
                ответ пользователю (увидит в приложении)
              </p>
              <textarea
                defaultValue={selected.adminReply || ""}
                id={`reply-${selected.id}`}
                rows={3}
                maxLength={2000}
                placeholder="Спасибо, исправили в версии…"
                className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
              />
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => {
                  const el = document.getElementById(`reply-${selected.id}`) as HTMLTextAreaElement | null;
                  patch.mutate({ id: selected.id, adminReply: el?.value ?? null });
                }}
                className="mt-2 w-full min-h-11 rounded-2xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {patch.isPending ? <Loader2 className="size-4 animate-spin inline" /> : "Ответить пользователю"}
              </button>
              {selected.repliedAt && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/80 mt-1.5">
                  отправлено {fmtDateTime(selected.repliedAt)} · придёт в колокольчик и в «Мои обращения»
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(selected.id)}
              className="w-full min-h-11 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              Удалить отзыв
            </button>
          </div>
        )}
      </MobileBottomSheet>
    </>
  );
}
