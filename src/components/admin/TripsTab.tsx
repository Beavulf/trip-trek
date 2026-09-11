"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Ban, Copy, Crown, Download, Loader2, RefreshCw, Search, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { UserAvatar } from "@/components/trip/user-avatar";
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
import { EmptyState, Stamp, TripStatusStamp, TRIP_STATUS_META, relTime, type TripStatus } from "./shared";

interface TripCounts {
  members: number;
  places: number;
  photos: number;
  expenses: number;
  journals: number;
}

interface AdminTripRow {
  id: string;
  title: string;
  destination: string;
  coverColor: string;
  coverEmoji: string;
  status: string;
  startDate: string;
  totalDays: number;
  currency: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  totalBudget: number;
  _count: TripCounts;
}

interface AdminTripDetail extends AdminTripRow {
  members: {
    id: string;
    role: string;
    displayName: string;
    emoji: string;
    color: string;
    budget: number | null;
    joinedAt: string;
    user: { id: string; name: string; email: string; emoji: string; color: string; avatarUrl: string | null; plan: string } | null;
  }[];
  bans: {
    id: string;
    reason: string | null;
    createdAt: string;
    user: { id: string; name: string; email: string; emoji: string; color: string; avatarUrl: string | null } | null;
  }[];
  _count: TripCounts & { days: number; messages: number };
}

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "planning", label: "Планируются" },
  { value: "active", label: "В пути" },
  { value: "completed", label: "Завершены" },
] as const;

/** Стартовый ?q= из адресной строки (ссылки «новые поездки» с Обзора).
 * Ленивый инициализатор: дети шелла не рендерятся на SSR (гейт по сессии). */
function initialQ(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() || "";
}

export function TripsTab() {
  const [input, setInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: trips, isLoading } = useQuery<AdminTripRow[]>({
    queryKey: ["admin-trips", q, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const r = await fetch(`/api/admin/trips${params.toString() ? `?${params}` : ""}`);
      if (!r.ok) throw new Error("fetch trips failed");
      return r.json();
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-trips"] });
    // Карточка в шторке должна сразу увидеть новый статус/название,
    // иначе повторный клик по прежнему статусу глотается guard'ом
    qc.invalidateQueries({ queryKey: ["admin-trip"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-journal"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/trips?id=${id}`, { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось удалить");
    },
    onSuccess: () => {
      setSelectedId(null);
      setConfirmDelete(false);
      invalidate();
      toast.success("Поездка удалена");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {/* Поиск + фильтр статуса */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Название или направление…"
            className="w-full min-h-11 rounded-2xl border border-border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={cn(
                "px-3 min-h-9 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                status === f.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список / таблица */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !trips?.length ? (
        <EmptyState emoji="🧭" title={q || status ? "Ничего не нашли по этим условиям" : "Поездок пока нет"} />
      ) : (
        <>
          {/* Мобильные карточки */}
          <div className="lg:hidden space-y-2.5">
            {trips.map((t, i) => (
              <motion.button
                key={t.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => setSelectedId(t.id)}
                className="w-full relative rounded-2xl bg-card border border-border overflow-hidden text-left hover:bg-accent/40 transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: t.coverColor }} />
                <div className="flex items-center gap-3 p-3 pl-4">
                  <span className="size-11 rounded-xl grid place-items-center text-xl shrink-0" style={{ background: `${t.coverColor}22` }}>
                    {t.coverEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">{t.title}</span>
                      <TripStatusStamp status={t.status} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.destination} · {t.totalDays} {plural(t.totalDays, "день", "дня", "дней")}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
                      {t._count.members} уч. · {t._count.places} мест · {t._count.photos} фото · {t._count.expenses} трат
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Таблица на ПК */}
          <div className="hidden lg:block rounded-2xl bg-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {["Поездка", "Статус", "Участники", "Места", "Фото", "Траты", "Старт"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground",
                        ["Участники", "Места", "Фото", "Траты", "Старт"].includes(h) ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trips.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="size-9 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: `${t.coverColor}22` }}>
                          {t.coverEmoji}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{t.destination}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TripStatusStamp status={t.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t._count.members}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t._count.places}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t._count.photos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t._count.expenses}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                      {new Date(t.startDate).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Детали поездки */}
      <TripDetailSheet
        tripId={selectedId}
        onClose={() => setSelectedId(null)}
        onDelete={() => selectedId && remove.mutate(selectedId)}
        removePending={remove.isPending}
        invalidate={invalidate}
      />

      {/* Подтверждение удаления — на уровне списка, чтобы работало и из шторки */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить поездку?</AlertDialogTitle>
            <AlertDialogDescription>
              Вместе с поездкой исчезнут дни, места, фото, траты и дневники всех участников. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmDelete(false);
                if (selectedId) remove.mutate(selectedId);
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TripDetailSheet({
  tripId,
  onClose,
  onDelete,
  removePending,
  invalidate,
}: {
  tripId: string | null;
  onClose: () => void;
  onDelete: () => void;
  removePending: boolean;
  invalidate: () => void;
}) {
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [form, setForm] = useState<{ title: string; destination: string; totalBudget: string; currency: string } | null>(null);
  const qc = useQueryClient();
  // Действие над участником, ждущее подтверждения
  const [memberAction, setMemberAction] = useState<
    { kind: "remove" | "ban" | "transfer"; memberId: string; userId: string; name: string } | null
  >(null);

  const { data: trip } = useQuery<AdminTripDetail>({
    queryKey: ["admin-trip", tripId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/trips?id=${tripId}`);
      if (!r.ok) throw new Error("fetch trip failed");
      return r.json();
    },
    enabled: !!tripId,
  });

  useEffect(() => {
    if (trip && !form) {
      setForm({
        title: trip.title,
        destination: trip.destination,
        totalBudget: String(trip.totalBudget),
        currency: trip.currency,
      });
    }
    if (!tripId) setForm(null);
  }, [trip, tripId, form]);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch("/api/admin/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Сохранено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // После успешного PATCH перечитываем карточку и ресинхронизируем форму
  useEffect(() => {
    if (patch.isSuccess && trip && form) {
      setForm({
        title: trip.title,
        destination: trip.destination,
        totalBudget: String(trip.totalBudget),
        currency: trip.currency,
      });
    }
  }, [patch.isSuccess, trip?.updatedAt]);

  // Исключить / забанить / разбанить / передать владение
  const memberAct = useMutation({
    mutationFn: async (opts: { method: "POST" | "DELETE"; query?: string; body?: Record<string, unknown> }) => {
      const r = await fetch(`/api/admin/trips/members${opts.query ? `?${opts.query}` : ""}`, {
        method: opts.method,
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось выполнить");
      return json;
    },
    onSuccess: () => {
      invalidate();
      if (tripId) qc.invalidateQueries({ queryKey: ["admin-trip", tripId] });
      setMemberAction(null);
      toast.success("Готово — пользователь получил уведомление");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transfer = useMutation({
    mutationFn: async (userId: string) => {
      const r = await fetch("/api/admin/trips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tripId, transferTo: userId }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось передать владение");
      return json;
    },
    onSuccess: () => {
      invalidate();
      if (tripId) qc.invalidateQueries({ queryKey: ["admin-trip", tripId] });
      setMemberAction(null);
      toast.success("Владение передано");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportJson = useCallback(async () => {
    if (!trip) return;
    try {
      const r = await fetch(`/api/admin/trips?export=${trip.id}`);
      if (!r.ok) throw new Error("Экспорт не удался");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${trip.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "trip"}-backup.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Бэкап скачан");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Экспорт не удался");
    }
  }, [trip]);

  if (!tripId || !trip || !form) return null;

  const formDirty =
    form.title !== trip.title ||
    form.destination !== trip.destination ||
    form.totalBudget !== String(trip.totalBudget) ||
    form.currency !== trip.currency;

  const saveForm = () =>
    patch.mutate({
      id: trip.id,
      ...(form.title !== trip.title ? { title: form.title } : {}),
      ...(form.destination !== trip.destination ? { destination: form.destination } : {}),
      ...(form.totalBudget !== String(trip.totalBudget) && form.totalBudget !== "" ? { totalBudget: Number(form.totalBudget) } : {}),
      ...(form.currency !== trip.currency ? { currency: form.currency } : {}),
    });

  return (
    <MobileBottomSheet
      open={!!tripId}
      onOpenChange={(v) => !v && onClose()}
      title={trip.title}
      titleIcon={<span>{trip.coverEmoji}</span>}
    >
      <div className="space-y-4">
        {/* Сводка */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: "Направление", value: trip.destination },
            { label: "Длительность", value: `${trip.totalDays} ${plural(trip.totalDays, "день", "дня", "дней")}` },
            { label: "Старт", value: new Date(trip.startDate).toLocaleDateString("ru-RU") },
            { label: "Бюджет", value: `${trip.totalBudget} ${trip.currency}` },
            { label: "Дней создано", value: String(trip._count.days) },
            { label: "Сообщений", value: String(trip._count.messages) },
          ].map((row) => (
            <div key={row.label} className="rounded-xl bg-secondary/50 p-2.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{row.label}</div>
              <div className="text-sm font-semibold mt-0.5 truncate">{row.value}</div>
            </div>
          ))}
        </div>

        {/* Статус — быстрое переключение */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">статус</p>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted">
            {(Object.keys(TRIP_STATUS_META) as TripStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                disabled={patch.isPending}
                onClick={() => trip.status !== s && patch.mutate({ id: trip.id, status: s })}
                className={cn(
                  "min-h-10 rounded-xl text-xs font-semibold transition-all disabled:opacity-50",
                  trip.status === s ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {TRIP_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Состав */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">состав</p>
          <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {trip.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <UserAvatar
                  name={m.displayName}
                  emoji={m.emoji}
                  color={m.color}
                  avatarUrl={m.user?.avatarUrl}
                  className="size-9 text-base"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{m.displayName}</span>
                    {m.role === "owner" ? <Stamp label="Владелец" color="#10b981" /> : null}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate">
                    {m.user ? m.user.email : "аккаунт удалён"}
                    {m.user?.plan === "premium" ? " · premium" : ""}
                    {m.budget != null ? ` · бюджет ${m.budget} ${trip.currency}` : ""}
                  </div>
                </div>
                {m.role !== "owner" && m.user && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Передать владение"
                      aria-label={`Передать владение ${m.displayName}`}
                      disabled={transfer.isPending}
                      onClick={() => setMemberAction({ kind: "transfer", memberId: m.id, userId: m.user!.id, name: m.displayName })}
                      className="size-9 rounded-xl grid place-items-center text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Crown className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Исключить из поездки"
                      aria-label={`Исключить ${m.displayName}`}
                      disabled={memberAct.isPending}
                      onClick={() => setMemberAction({ kind: "remove", memberId: m.id, userId: m.user!.id, name: m.displayName })}
                      className="size-9 rounded-xl grid place-items-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <UserMinus className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Заблокировать в поездке"
                      aria-label={`Заблокировать ${m.displayName}`}
                      disabled={memberAct.isPending}
                      onClick={() => setMemberAction({ kind: "ban", memberId: m.id, userId: m.user!.id, name: m.displayName })}
                      className="size-9 rounded-xl grid place-items-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Ban className="size-4" />
                    </button>
                  </div>
                )}
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 shrink-0">
                  {new Date(m.joinedAt).toLocaleDateString("ru-RU")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Заблокированные */}
        {trip.bans.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
              заблокированные в поездке
            </p>
            <div className="rounded-2xl border border-destructive/20 divide-y divide-border overflow-hidden">
              {trip.bans.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 bg-destructive/5">
                  <UserAvatar
                    name={b.user?.name || "?"}
                    emoji={b.user?.emoji || "🚫"}
                    color={b.user?.color || "#94a3b8"}
                    avatarUrl={b.user?.avatarUrl}
                    className="size-9 text-base opacity-80"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.user?.name || "аккаунт удалён"}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate">
                      {b.reason ? `${b.reason} · ` : ""}с {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={memberAct.isPending}
                    onClick={() => memberAct.mutate({ method: "DELETE", query: `banId=${b.id}` })}
                    className="min-h-9 px-3 rounded-xl bg-secondary border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <ShieldCheck className="size-3.5" />
                    Разблокировать
                  </button>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 mt-1.5">
              забаненный не сможет зайти по ссылке-приглашению
            </p>
          </div>
        )}

        {/* Контент */}
        <div className="rounded-2xl border border-border divide-y divide-border">
          {[
            { label: "Места", value: trip._count.places },
            { label: "Фото", value: trip._count.photos },
            { label: "Траты", value: trip._count.expenses },
            { label: "Записи дневника", value: trip._count.journals },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(trip.inviteCode);
              toast.success("Код приглашения скопирован");
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-accent/50 transition-colors"
          >
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              Код приглашения <Copy className="size-3.5" />
            </span>
            <span className="font-mono font-bold text-xs tracking-wider">{trip.inviteCode}</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmRegen(true)}
            disabled={patch.isPending}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-accent/50 transition-colors disabled:opacity-50"
          >
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              Перевыпустить код <RefreshCw className="size-3.5" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">старый перестанет работать</span>
          </button>
          <button
            type="button"
            onClick={() => void exportJson()}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-accent/50 transition-colors"
          >
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              Скачать бэкап JSON <Download className="size-3.5" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">формат v2.0</span>
          </button>
        </div>

        {/* Редактирование */}
        <div className="rounded-2xl border border-border p-3.5 space-y-2.5">
          <div className="text-sm font-semibold">Редактировать поездку</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Название</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Направление</span>
              <input
                value={form.destination}
                onChange={(e) => setForm((f) => f && { ...f, destination: e.target.value })}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Бюджет</span>
              <input
                type="number"
                min={0}
                value={form.totalBudget}
                onChange={(e) => setForm((f) => f && { ...f, totalBudget: e.target.value })}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Валюта</span>
              <input
                value={form.currency}
                maxLength={3}
                onChange={(e) => setForm((f) => f && { ...f, currency: e.target.value.toUpperCase() })}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm font-mono uppercase input-mobile"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!formDirty || patch.isPending}
            onClick={saveForm}
            className="w-full min-h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            Сохранить поездку
          </button>
        </div>

        <button
          type="button"
          disabled={removePending}
          onClick={onDelete}
          className="w-full min-h-12 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          <Trash2 className="size-4" />
          Удалить поездку
        </button>
      </div>

      {/* Подтверждение действия над участником */}
      <AlertDialog open={!!memberAction} onOpenChange={(v) => !v && setMemberAction(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          {memberAction?.kind === "remove" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Исключить {memberAction.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Участник потеряет доступ к поездке, но его траты останутся в истории. Он получит уведомление.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    memberAct.mutate({ method: "DELETE", query: `memberId=${memberAction.memberId}` });
                  }}
                  className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  Исключить
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {memberAction?.kind === "ban" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Заблокировать {memberAction.name} в поездке?</AlertDialogTitle>
                <AlertDialogDescription>
                  Участник будет исключён и не сможет вернуться по ссылке-приглашению — пригласительный код для него
                  перестанет работать. Получит уведомление.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    memberAct.mutate({
                      method: "POST",
                      body: { tripId, userId: memberAction.userId, reason: "Заблокирован админом" },
                    });
                  }}
                  className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  Заблокировать
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {memberAction?.kind === "transfer" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Передать владение {memberAction.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Текущий владелец станет обычным участником. Новый владелец получит уведомление и сможет управлять
                  составом.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    transfer.mutate(memberAction.userId);
                  }}
                  className="rounded-xl"
                >
                  Передать владение
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение перевыпуска кода */}
      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Перевыпустить код приглашения?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущий код {trip.inviteCode} перестанет работать. Новые участники смогут присоединиться только по новому коду.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmRegen(false);
                patch.mutate({ id: trip.id, regenInvite: true });
              }}
              className="rounded-xl"
            >
              Перевыпустить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileBottomSheet>
  );
}
