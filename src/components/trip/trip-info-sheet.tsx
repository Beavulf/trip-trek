"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Check,
  Copy,
  Download,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useAuth } from "@/hooks/use-auth";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { X, Share2 } from "lucide-react";
import { MemberManager } from "./member-manager";
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

// Окно «О поездке»: всё о поездке на одном экране — статус, даты, бюджет,
// участники с датами вступления; владельцу — управление составом и статусом,
// остальным — выход из поездки. Открывается из шапки (ПК) и меню «Ещё» (мобайл).

const STATUS_META: Record<string, { label: string; color: string }> = {
  planning: { label: "Планируется", color: "#0ea5e9" },
  active: { label: "В пути", color: "#10b981" },
  completed: { label: "Завершена", color: "#94a3b8" },
};

export function TripInfoSheet({
  open,
  onOpenChange,
  onInvite,
  onShare,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvite: () => void;
  onShare: () => void;
}) {
  useBodyScrollLock(open);
  const tripId = useCurrentTripId();
  const { data: trip, refetch } = useTrip();
  const qc = useQueryClient();
  const { data: session } = useAuth();
  const { setTripSwitcherOpen } = useTripStore();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Переименование поездки (владелец): чип в шапке берёт title из списка
  // поездок, поэтому после сохранения инвалидируем и его
  const rename = useMutation({
    mutationFn: async (title: string) => {
      const r = await fetch(`/api/trip?tripId=${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json;
    },
    onSuccess: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Название обновлено ✏️");
      setEditTitle(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open || typeof document === "undefined") return null;

  const me = session?.user as { id?: string } | undefined;
  const myMember = trip?.participants.find((p) => p.id === me?.id);
  const isOwner = myMember?.role === "owner";

  const startEditTitle = () => {
    setTitleDraft(t?.title || "");
    setEditTitle(true);
  };

  const s = trip?.settings;
  const t = trip?.trip;
  const status = STATUS_META[t?.status || "planning"] || STATUS_META.planning;

  const start = s?.startDate ? new Date(s.startDate) : null;
  const end = start && s?.totalDays ? new Date(start.getTime() + (s.totalDays - 1) * 86_400_000) : null;
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ru-RU") : "—");

  // Приглашать можно, пока владелец не выключил это для участников
  // (undefined — старый кэш/ответ без поля: считаем, что разрешено)
  const canInvite = isOwner || s?.allowMemberInvites !== false;

  const copyInvite = async () => {
    if (!s?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(s.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Код скопирован 📋");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const downloadBackup = async () => {
    if (!tripId) return;
    try {
      const r = await fetch(`/api/export?tripId=${tripId}`);
      if (!r.ok) throw new Error("Экспорт не удался");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(t?.title || "trip").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "trip"}-backup.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Бэкап скачан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Экспорт не удался");
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto overscroll-contain max-h-[92dvh]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
            <h2 className="font-bold text-base">О поездке</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="size-11 rounded-full hover:bg-accent grid place-items-center"
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>
          </div>

          {!tripId || !trip ? (
            <div className="p-6 space-y-3 text-center">
              <p className="text-sm font-medium">{!tripId ? "Нет активной поездки" : "Загружаем…"}</p>
              {!tripId && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    setTripSwitcherOpen(true);
                  }}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium"
                >
                  Мои поездки →
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              {/* Шапка поездки */}
              <div className="flex items-start gap-3">
                <span
                  className="size-14 rounded-2xl grid place-items-center text-3xl shrink-0"
                  style={{ background: `${t?.coverColor || "#f97316"}22` }}
                >
                  {t?.coverEmoji || "🌏"}
                </span>
                <div className="flex-1 min-w-0">
                  {editTitle ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && titleDraft.trim()) rename.mutate(titleDraft);
                          if (e.key === "Escape") setEditTitle(false);
                        }}
                        maxLength={120}
                        autoFocus
                        aria-label="Название поездки"
                        className="min-w-0 flex-1 rounded-xl border border-input bg-background px-2.5 py-2 text-sm font-bold input-mobile"
                      />
                      <button
                        type="button"
                        onClick={() => titleDraft.trim() && rename.mutate(titleDraft)}
                        disabled={rename.isPending || !titleDraft.trim() || titleDraft.trim() === (t?.title || "")}
                        aria-label="Сохранить название"
                        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                      >
                        {rename.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTitle(false)}
                        aria-label="Отменить правку"
                        className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground transition-transform active:scale-95"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 truncate font-bold text-base leading-tight">{t?.title}</div>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={startEditTitle}
                          aria-label="Переименовать поездку"
                          title="Переименовать"
                          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="size-3" />
                    {t?.destination}
                  </div>
                  <span
                    className="inline-block mt-1.5 -rotate-3 rounded-[4px] border-2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                    style={{ color: status.color, borderColor: status.color, background: `${status.color}12` }}
                  >
                    {status.label}
                  </span>
                </div>
              </div>

              {/* Прогресс дня; до старта (currentDayNumber = 0) — дата старта вместо «День 0» */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium">
                    {trip.currentDayNumber < 1
                      ? `Поездка начнётся ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(s?.startDate ?? Date.now()))}`
                      : `День ${trip.currentDayNumber} из ${s?.totalDays}`}
                  </span>
                  <span className="font-mono text-muted-foreground">{trip.dayProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${trip.dayProgress}%`, background: t?.coverColor || "#f97316" }}
                  />
                </div>
              </div>

              {/* Учётная карточка */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/50 p-2.5 col-span-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                    <CalendarDays className="size-3" /> даты
                  </div>
                  <div className="text-sm font-semibold mt-0.5">
                    {fmt(start)} — {fmt(end)} · {s?.totalDays} {plural(s?.totalDays || 0, "день", "дня", "дней")}
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                    <Wallet className="size-3" /> бюджет
                  </div>
                  <div className="text-sm font-semibold mt-0.5 truncate">
                    {Math.round(s?.totalBudget || 0).toLocaleString("ru-RU")} {s?.currency}
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                    потрачено
                  </div>
                  <div className="text-sm font-semibold mt-0.5">
                    {Math.round(trip.totalSpent).toLocaleString("ru-RU")} {s?.currency}
                  </div>
                </div>
              </div>

              {/* Статус поездки — только владельцу */}
              {isOwner && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
                    статус поездки
                  </p>
                  <StatusSwitch tripId={tripId} current={t?.status || "planning"} refetch={refetch} />
                </div>
              )}

              {/* Приглашение: код + кнопки; при запрете не-владельцу — пояснение */}
              {canInvite ? (
                <div className="rounded-2xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                        код приглашения
                      </div>
                      <div className="font-mono font-black text-sm tracking-[0.12em] truncate">{s?.inviteCode}</div>
                    </div>
                    <button
                      type="button"
                      onClick={copyInvite}
                      aria-label="Скопировать код"
                      className={cn(
                        "size-10 rounded-xl grid place-items-center shrink-0 transition-colors",
                        copied ? "bg-green-500 text-white" : "bg-secondary hover:bg-accent"
                      )}
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onInvite();
                      }}
                      className="min-h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <UserPlus className="size-3.5" />
                      Пригласить
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onShare();
                      }}
                      className="min-h-10 rounded-xl bg-secondary border border-border text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent transition-colors"
                    >
                      <Share2 className="size-3.5" />
                      Карточка
                    </button>
                  </div>
                  {isOwner && (
                    <InvitePolicySwitch tripId={tripId} current={s?.allowMemberInvites !== false} refetch={refetch} />
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-border p-3 flex items-center gap-2.5 text-muted-foreground">
                  <Lock className="size-4 shrink-0" />
                  <p className="text-xs leading-snug">
                    Приглашать новых участников может только владелец поездки.
                  </p>
                </div>
              )}

              {/* Участники (с управлением для владельца) */}
              <MemberManager tripId={tripId} members={trip.participants} refetch={refetch} detailed />

              {/* Действия с поездкой: бэкап — полный дамп, только владельцу */}
              <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void downloadBackup()}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-sm hover:bg-accent/50 transition-colors text-left"
                  >
                    <Download className="size-4 text-muted-foreground" />
                    <span className="flex-1">Скачать бэкап JSON</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">v2.0</span>
                  </button>
                )}

                {isOwner ? (
                  <div className="px-3.5 py-3 flex items-center gap-3">
                    <LogOut className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm text-muted-foreground">
                      Владелец не может выйти — сначала передайте владение
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                  >
                    <LogOut className="size-4" />
                    <span className="flex-1 font-medium">Покинуть поездку</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Подтверждение выхода */}
        <LeaveDialog
          open={confirmLeave}
          tripId={tripId}
          tripTitle={t?.title || ""}
          onClose={() => setConfirmLeave(false)}
          onLeft={() => {
            setConfirmLeave(false);
            onOpenChange(false);
            void refetch();
          }}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/** Кто может приглашать (владелец): все участники или только владелец */
function InvitePolicySwitch({
  tripId,
  current,
  refetch,
}: {
  tripId: string;
  current: boolean;
  refetch: () => Promise<unknown>;
}) {
  const patch = useMutation({
    mutationFn: async (allowMemberInvites: boolean) => {
      const r = await fetch(`/api/trip?tripId=${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMemberInvites }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json;
    },
    onSuccess: async (_d, allow) => {
      await refetch();
      toast.success(allow ? "Приглашать могут все участники" : "Приглашает только владелец");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = [
    { value: true, label: "Все участники", icon: Users },
    { value: false, label: "Только владелец", icon: Lock },
  ] as const;

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted">
        {options.map((o) => {
          const Icon = o.icon;
          const active = current === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              disabled={patch.isPending}
              onClick={() => current !== o.value && patch.mutate(o.value)}
              aria-pressed={active}
              className={cn(
                "min-h-9 rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-50",
                active ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
        {current
          ? "Код приглашения виден всем участникам"
          : "Код приглашения виден только вам — участники позвать друзей не смогут"}
      </p>
    </div>
  );
}

/** Переключатель статуса (владелец): planning / active / completed */
function StatusSwitch({
  tripId,
  current,
  refetch,
}: {
  tripId: string;
  current: string;
  refetch: () => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const patch = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`/api/trip?tripId=${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json;
    },
    onSuccess: async (_d, status) => {
      await refetch();
      toast.success(`Статус: ${STATUS_META[status]?.label || status}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted">
      {Object.entries(STATUS_META).map(([key, meta]) => (
        <button
          key={key}
          type="button"
          disabled={patch.isPending}
          onClick={() => current !== key && patch.mutate(key)}
          className={cn(
            "min-h-10 rounded-xl text-xs font-semibold transition-all disabled:opacity-50",
            current === key ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {saving && patch.isPending ? <Loader2 className="size-3.5 animate-spin inline" /> : meta.label}
        </button>
      ))}
    </div>
  );
}

/** Выход из поездки (не владелец) */
function LeaveDialog({
  open,
  tripId,
  tripTitle,
  onClose,
  onLeft,
}: {
  open: boolean;
  tripId: string;
  tripTitle: string;
  onClose: () => void;
  onLeft: () => void;
}) {
  const leave = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/participants/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось выйти");
      return json;
    },
    onSuccess: () => {
      toast.success(`Вы покинули «${tripTitle}»`);
      onLeft();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-sm rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Покинуть «{tripTitle}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Ты больше не будешь видеть поездку и её обновления. Вернуться можно только по новому приглашению владельца.
            Твои траты останутся в общем бюджете.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="mt-0 rounded-xl">Остаться</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              leave.mutate();
            }}
            className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
          >
            {leave.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Покинуть
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
