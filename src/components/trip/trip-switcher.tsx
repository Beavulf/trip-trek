"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  Globe,
  Users,
  Calendar,
  ArrowRight,
  Crown,
  Sparkles,
  Ticket,
  Search,
  Minus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth as useSession } from "@/hooks/use-auth";
import { toast } from "sonner";
import { setTripId, useCurrentTripId, useTrip } from "@/hooks/use-trip";
import { useRouter } from "next/navigation";
import { PremiumModal } from "./premium-modal";
import { TemplatePicker } from "./template-picker";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

/** Фаза поездки по датам: ещё не началась / идёт / закончилась */
function tripPhase(startDate: string | Date, totalDays: number): "upcoming" | "active" | "done" {
  const start = new Date(startDate);
  const now = new Date();
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((todayDay - startDay) / 86_400_000); // 0 = первый день
  if (diff < 0) return "upcoming";
  if (diff >= totalDays) return "done";
  return "active";
}

/** Номер текущего дня поездки (1-based), зажат в 1..totalDays; 0 если ещё не началась */
function tripDayNo(startDate: string | Date, totalDays: number): number {
  const start = new Date(startDate);
  const now = new Date();
  const diff = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      86_400_000,
  );
  return Math.max(0, Math.min(totalDays, diff + 1));
}

const PHASE_STYLE = {
  upcoming: { label: "Скоро", color: "#0ea5e9" },
  active: { label: "В пути", color: "#10b981" },
  done: { label: "Завершена", color: "#94a3b8" },
} as const;

/** Повернутый штамп статуса — как печат ы в паспорте путешественника */
function StatusStamp({ phase }: { phase: keyof typeof PHASE_STYLE }) {
  const { label, color } = PHASE_STYLE[phase];
  return (
    <span
      className="shrink-0 -rotate-6 rounded-[4px] border-2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] leading-tight select-none"
      style={{ color, borderColor: color, background: `${color}12` }}
      aria-label={label}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

function dateRangeLabel(startDate: string, totalDays: number) {
  const end = new Date(new Date(startDate).getTime() + (totalDays - 1) * 86_400_000);
  const endLabel = fmtDate(end.toISOString());
  const year = new Date(end).getFullYear();
  return `${fmtDate(startDate)} – ${endLabel}${year !== new Date().getFullYear() ? ` ${year}` : ""}`;
}

export function TripSwitcher() {
  const open = useTripStore((s) => s.tripSwitcherOpen);
  const setOpen = useTripStore((s) => s.setTripSwitcherOpen);
  const [view, setView] = useState<"list" | "create">("list");
  const [filter, setFilter] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: currentTripData } = useTrip();
  useBodyScrollLock(open);

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isPremium = (session?.user as { plan?: string } | undefined)?.plan === "premium";

  // Список поездок — только из сессии (API больше не принимает spoof userId)
  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", userId],
    queryFn: async () => {
      const r = await fetch("/api/trips");
      if (!r.ok) throw new Error("fetch trips failed");
      return r.json() as Promise<TripCard[]>;
    },
    enabled: status === "authenticated",
  });

  const currentTripId = useCurrentTripId();
  const currentTrip = trips?.find((t) => t.id === currentTripId) || trips?.[0];
  const pendingTripId = useTripStore((s) => s.pendingTripId);
  const setPendingTripId = useTripStore((s) => s.setPendingTripId);

  // Фильтр по названию/направлению (в JS — чтобы кириллица не зависела от регистра)
  const visibleTrips = useMemo(() => {
    if (!trips) return [];
    const q = filter.trim().toLowerCase();
    const byQuery = q
      ? trips.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.destination || "").toLowerCase().includes(q),
        )
      : trips;
    const order = { active: 0, upcoming: 1, done: 2 } as const;
    return [...byQuery].sort((a, b) => {
      const ca = a.id === currentTripId;
      const cb = b.id === currentTripId;
      if (ca !== cb) return ca ? -1 : 1;
      const pa = order[tripPhase(a.startDate, a.totalDays)];
      const pb = order[tripPhase(b.startDate, b.totalDays)];
      if (pa !== pb) return pa - pb;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [trips, filter, currentTripId]);

  // Пустой или устаревший tripId → первая доступная; если поездок нет — очистить id
  useEffect(() => {
    if (!trips) return;
    // созданную поездку ждём в списке, чтобы эффект не сбросил выбор на первую попавшуюся
    if (pendingTripId) {
      if (trips.some((t) => t.id === pendingTripId)) setPendingTripId(null);
      return;
    }
    if (trips.length === 0) {
      if (currentTripId) {
        setTripId("");
        qc.invalidateQueries({ queryKey: ["trip"] });
      }
      return;
    }
    const known = trips.some((t) => t.id === currentTripId);
    if (currentTripId && known) return;
    setTripId(trips[0].id);
    qc.invalidateQueries({ queryKey: ["trip"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["budget-plan"] });
    qc.invalidateQueries({ queryKey: ["days"] });
    qc.invalidateQueries({ queryKey: ["photos"] });
  }, [currentTripId, trips, qc, pendingTripId, setPendingTripId]);

  // Создать поездку — через /api/limits с проверкой
  const createTrip = useMutation({
    mutationFn: async (data: {
      title: string;
      destination: string;
      startDate: string;
      totalDays: number;
      totalBudget: number;
      userId: string;
      displayName: string;
      emoji: string;
      color: string;
      coverEmoji: string;
      coverColor: string;
    }) => {
      const r = await fetch("/api/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (r.status === 403) {
        const err = await r.json();
        throw new Error(err.upgrade ? "LIMIT_REACHED" : "create failed");
      }
      if (!r.ok) throw new Error("create failed");
      return r.json();
    },
    onError: (error) => {
      if (error.message === "LIMIT_REACHED") {
        setPremiumOpen(true);
      } else {
        toast.error("Не удалось создать поездку");
      }
    },
    onSuccess: (data) => {
      setPendingTripId(data.id);
      setTripId(data.id);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      toast.success("Поездка создана! 🎉");
      setOpen(false);
      setView("list");
    },
  });

  // Переключить поездку
  const switchTrip = (tripId: string) => {
    if (tripId === currentTripId) {
      setOpen(false);
      return;
    }
    setTripId(tripId);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["trip"] });
    qc.invalidateQueries({ queryKey: ["days"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["photos"] });
    qc.invalidateQueries({ queryKey: ["journal"] });
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["checklist"] });
    qc.invalidateQueries({ queryKey: ["info"] });
    qc.invalidateQueries({ queryKey: ["phrases"] });
    qc.invalidateQueries({ queryKey: ["foods"] });
    qc.invalidateQueries({ queryKey: ["budget-plan"] });
    toast.success("Поездка переключена 🌏");
  };

  const close = () => {
    setOpen(false);
    setView("list");
    setFilter("");
  };

  // В dev режиме показываем switcher даже без сессии
  // В prod — только если авторизован
  if (!userId && status !== "loading" && process.env.NODE_ENV === "production") return null;

  return (
    <>
      {/* Чип текущей поездки в шапке */}
      <HeaderTripChip onOpen={() => setOpen(true)} trip={currentTrip} tripData={currentTripData} />

      {/* Модалка — доска поездок */}
      {open && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full sm:max-w-md max-h-[92dvh] rounded-t-3xl sm:rounded-3xl overflow-y-auto overscroll-contain"
            >
              {/* Handle */}
              <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  Мои поездки
                  {trips && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {trips.length}
                    </span>
                  )}
                </h2>
                <button onClick={close} className="size-11 rounded-full hover:bg-accent grid place-items-center" aria-label="Закрыть">
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-4">
                {view === "create" ? (
                  <CreateTripForm
                    userId={userId || ""}
                    userName={session?.user?.name || "Я"}
                    onSubmit={(data) => createTrip.mutate(data)}
                    onCancel={() => setView("list")}
                    loading={createTrip.isPending}
                  />
                ) : (
                  <>
                    {/* Поиск по поездкам */}
                    {trips && trips.length > 3 && (
                      <div className="relative mb-3">
                        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Найти поездку…"
                          className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2.5 text-base input-mobile"
                        />
                      </div>
                    )}

                    {/* Список поездок */}
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Загрузка…
                      </div>
                    ) : visibleTrips.length > 0 ? (
                      <div className="space-y-2">
                        {visibleTrips.map((trip) => {
                          const phase = tripPhase(trip.startDate, trip.totalDays);
                          const dayNo = tripDayNo(trip.startDate, trip.totalDays);
                          const isCurrent = trip.id === currentTripId;
                          const isOwner = trip.myRole === "owner";
                          return (
                            <button
                              key={trip.id}
                              onClick={() => switchTrip(trip.id)}
                              className={cn(
                                "relative w-full flex items-start gap-3 p-3 pl-4 rounded-2xl border-2 transition-all text-left overflow-hidden",
                                isCurrent
                                  ? "border-primary bg-primary/5 shadow-sm"
                                  : "border-border hover:border-primary/40 hover:bg-accent/40"
                              )}
                            >
                              {/* Корешок под цвет обложки */}
                              <span
                                className="absolute left-0 top-0 bottom-0 w-1.5"
                                style={{ background: trip.coverColor || "#f97316" }}
                                aria-hidden
                              />
                              {/* Штамп-обложка */}
                              <div
                                className="size-11 rounded-xl grid place-items-center text-xl shrink-0 shadow-md border border-black/5"
                                style={{ background: trip.coverColor || "#f97316" }}
                              >
                                {trip.coverEmoji || "🌏"}
                              </div>
                              {/* Инфо */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm truncate">{trip.title}</span>
                                  {isOwner && (
                                    <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">
                                      владелец
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                  <Calendar className="size-3 shrink-0" />
                                  <span className="truncate">
                                    {dateRangeLabel(trip.startDate, trip.totalDays)}
                                  </span>
                                  <span className="opacity-40">·</span>
                                  <Users className="size-3 shrink-0" />
                                  <span className="shrink-0">{trip.members?.length ?? 0}</span>
                                </div>
                                {/* Прогресс дней у активной поездки */}
                                {phase === "active" && (
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                                        style={{ width: `${Math.round((dayNo / trip.totalDays) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                                      день {dayNo}/{trip.totalDays}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Штамп статуса или «текущая» */}
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {isCurrent && (
                                  <span className="text-[8px] font-black uppercase tracking-wider text-primary bg-primary/10 px-1 py-0.5 rounded rotate-0">
                                    сейчас
                                  </span>
                                )}
                                <StatusStamp phase={phase} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : trips && trips.length > 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        Не нашлось по «{filter}»
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-4xl mb-2">🧳</div>
                        <p className="text-sm text-muted-foreground mb-1">Пока ни одной поездки</p>
                        <p className="text-xs text-muted-foreground/70">Создай первую или присоединись к друзьям</p>
                      </div>
                    )}

                    {/* Действия: три плитки */}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <button
                        onClick={() => setView("create")}
                        className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors"
                      >
                        <Plus className="size-5" />
                        <span className="text-xs font-semibold leading-tight">С нуля</span>
                      </button>
                      <button
                        onClick={() => { close(); setTemplateOpen(true); }}
                        className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-gradient-to-b from-primary/10 to-rose-500/10 border-2 border-primary/20 hover:border-primary/50 transition-colors"
                      >
                        <Sparkles className="size-5 text-primary" />
                        <span className="text-xs font-semibold leading-tight">По шаблону</span>
                      </button>
                      <button
                        onClick={() => router.push("/join")}
                        className="flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-secondary hover:bg-accent transition-colors"
                      >
                        <Ticket className="size-5" />
                        <span className="text-xs font-semibold leading-tight">По коду</span>
                      </button>
                    </div>

                    {/* Premium — только для бесплатного тарифа */}
                    {!isPremium && (
                      <button
                        onClick={() => setPremiumOpen(true)}
                        className="w-full flex items-center justify-center gap-2 min-h-11 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium mt-2"
                      >
                        <Crown className="size-4" />
                        <span className="text-sm">Premium — безлимит поездок и участников</span>
                        <ChevronRight className="size-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      <PremiumModal open={premiumOpen} onOpenChange={setPremiumOpen} />
      <TemplatePicker open={templateOpen} onOpenChange={setTemplateOpen} />
    </>
  );
}

/** Чип текущей поездки в шапке: эмодзи-штамп + название + день */
function HeaderTripChip({
  onOpen,
  trip,
  tripData,
}: {
  onOpen: () => void;
  trip?: TripCard;
  tripData: ReturnType<typeof useTrip>["data"];
}) {
  const dayLine = tripData
    ? `День ${tripData.currentDayNumber}/${tripData.settings.totalDays}`
    : null;
  const title = trip?.title || "Поездки";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-2 min-h-11 max-w-[38vw] sm:max-w-56 pl-1 pr-2 rounded-xl bg-secondary border border-border hover:bg-accent hover:border-primary/40 transition-colors min-w-0"
      title="Сменить поездку"
      aria-label={dayLine ? `Текущая поездка: ${title}, ${dayLine}. Сменить` : `Текущая поездка: ${title}. Сменить поездку`}
    >
      <span
        className="size-7 rounded-lg grid place-items-center text-sm shrink-0 shadow-sm"
        style={{ background: trip?.coverColor || "#f97316" }}
        aria-hidden
      >
        {trip?.coverEmoji || "🌏"}
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-xs font-bold truncate">{title}</span>
        <span className="block text-[10px] text-muted-foreground truncate">
          {dayLine || "сменить поездку"}
        </span>
      </span>
      <ChevronDown className="size-3.5 text-muted-foreground shrink-0 transition-transform group-hover:translate-y-0.5" />
    </button>
  );
}

// Форма создания поездки с нуля
function CreateTripForm({
  userId, userName, onSubmit, onCancel, loading,
}: {
  userId: string;
  userName: string;
  onSubmit: (data: CreateTripData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [totalDays, setTotalDays] = useState(12);
  const [totalBudget, setTotalBudget] = useState("1100");
  const [emoji, setEmoji] = useState("🌏");
  const [color, setColor] = useState("#f97316");

  const EMOJIS = ["🌏", "✈️", "🧳", "🗾", "🇨🇳", "🇯🇵", "🇹🇭", "🇻🇳", "🇰🇷", "🏖️", "🏔️", "🗽", "🗼", "🏯", "🎡", "⛺", "🚗", "🚂", "🏝️", "🌊", "🍥", "🥟", "🎬", "💃"];
  const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

  const submit = () => {
    if (!title.trim() || !startDate) {
      toast.error("Название и дата обязательны");
      return;
    }
    onSubmit({
      title: title.trim(),
      destination: destination.trim() || "Unknown",
      startDate,
      totalDays,
      totalBudget: parseFloat(totalBudget) || 1100,
      userId,
      displayName: userName,
      emoji,
      color,
      coverEmoji: emoji,
      coverColor: color,
    });
  };

  return (
    <div className="space-y-3.5">
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground min-h-11 flex items-center gap-1 -mt-1">
        <ArrowRight className="size-3.5 rotate-180" /> К списку поездок
      </button>

      {/* Превью + название одной строкой */}
      <div className="flex items-center gap-3">
        <div
          className="size-14 rounded-2xl grid place-items-center text-2xl shadow-lg border border-black/5 shrink-0 transition-all"
          style={{ background: color }}
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Япония — Токио и Киото"
            autoFocus
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base font-semibold input-mobile"
          />
        </div>
      </div>

      {/* Страна */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Страна / направление</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Japan"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
        />
      </div>

      {/* Дата старта */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Дата старта *</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
        />
      </div>

      {/* Дни (степпер) + бюджет */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дней</label>
          <div className="flex items-center rounded-xl border border-input bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setTotalDays((d) => Math.max(1, d - 1))}
              className="size-11 grid place-items-center hover:bg-accent active:scale-90 transition-all text-muted-foreground"
              aria-label="Меньше дней"
            >
              <Minus className="size-4" />
            </button>
            <span className="flex-1 text-center text-base font-bold tabular-nums">{totalDays}</span>
            <button
              type="button"
              onClick={() => setTotalDays((d) => Math.min(60, d + 1))}
              className="size-11 grid place-items-center hover:bg-accent active:scale-90 transition-all text-muted-foreground"
              aria-label="Больше дней"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Бюджет, $</label>
          <div className="flex items-center rounded-xl border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
            <span className="pl-3 text-sm text-muted-foreground">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              className="w-full bg-transparent px-2 py-2.5 text-base outline-none input-mobile"
            />
          </div>
        </div>
      </div>

      {/* Эмодзи — горизонтальная лента */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Обложка</label>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={cn(
                "size-10 rounded-xl text-xl grid place-items-center shrink-0 transition-all",
                emoji === e ? "bg-primary/20 ring-2 ring-primary scale-105" : "bg-muted hover:bg-accent"
              )}
              aria-label={`Эмодзи ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Цвет */}
      <div className="flex gap-2 justify-center">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "size-9 rounded-full transition-all",
              color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
            )}
            style={{ background: c }}
            aria-label={`Цвет ${c}`}
          />
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full rounded-xl bg-primary text-primary-foreground min-h-12 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {loading ? "Создаём…" : "Создать поездку"}
      </button>
    </div>
  );
}

interface TripCard {
  id: string;
  title: string;
  destination: string;
  inviteCode: string;
  coverColor: string;
  coverEmoji: string;
  startDate: string;
  totalDays: number;
  status: string;
  myRole?: string;
  members: { displayName: string; emoji: string; color: string }[];
  _count?: { places: number; photos: number; expenses: number; journals: number };
}

interface CreateTripData {
  title: string;
  destination: string;
  startDate: string;
  totalDays: number;
  totalBudget: number;
  userId: string;
  displayName: string;
  emoji: string;
  color: string;
  coverEmoji: string;
  coverColor: string;
}
