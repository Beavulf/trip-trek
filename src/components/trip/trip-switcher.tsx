"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Plus, ChevronRight, X, Loader2, Globe, Users, Calendar, ArrowRight, Crown, Sparkles } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth as useSession } from "@/hooks/use-auth";
import { toast } from "sonner";
import { setTripId, useCurrentTripId } from "@/hooks/use-trip";
import { useRouter } from "next/navigation";
import { PremiumModal } from "./premium-modal";
import { TemplatePicker } from "./template-picker";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export function TripSwitcher() {
  const open = useTripStore((s) => s.tripSwitcherOpen);
  const setOpen = useTripStore((s) => s.setTripSwitcherOpen);
  const [showCreate, setShowCreate] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  useBodyScrollLock(open);

  const userId = (session?.user as { id?: string } | undefined)?.id;

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

  // Пустой или устаревший tripId → первая доступная; если поездок нет — очистить id
  useEffect(() => {
    if (!trips) return;
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
  }, [currentTripId, trips, qc]);

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
      setTripId(data.id);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      toast.success("Поездка создана! 🎉");
      setOpen(false);
      setShowCreate(false);
      // Не используем router.refresh() — может вызвать перерендер и auth check
      // Query invalidation уже обновит данные
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

  // В dev режиме показываем switcher даже без сессии
  // В prod — только если авторизован
  if (!userId && status !== "loading" && process.env.NODE_ENV === "production") return null;

  return (
    <>
      {/* Кнопка переключателя */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 min-h-11 px-2.5 rounded-lg bg-secondary border border-border hover:bg-accent transition-colors shrink-0"
        title="Мои поездки"
        aria-label="Мои поездки"
      >
        <span className="text-base">{currentTrip?.coverEmoji || "🌏"}</span>
        <span className="text-xs font-medium hidden sm:inline">{currentTrip?.title?.slice(0, 15) || "Поездки"}</span>
      </button>

      {/* Модалка */}
      {open && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setOpen(false); setShowCreate(false); }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full sm:max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto"
            >
              {/* Handle */}
              <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Globe className="size-4" /> Мои поездки
                </h2>
                <button onClick={() => { setOpen(false); setShowCreate(false); }} className="size-8 rounded-full hover:bg-accent grid place-items-center">
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-4">
                {showCreate ? (
                  <CreateTripForm
                    userId={userId || ""}
                    userName={session?.user?.name || "Я"}
                    onSubmit={(data) => createTrip.mutate(data)}
                    onCancel={() => setShowCreate(false)}
                    loading={createTrip.isPending}
                  />
                ) : (
                  <>
                    {/* Список поездок */}
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Загрузка…
                      </div>
                    ) : trips && trips.length > 0 ? (
                      <div className="space-y-2">
                        {trips.map((trip) => (
                          <button
                            key={trip.id}
                            onClick={() => switchTrip(trip.id)}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left",
                              trip.id === currentTripId
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/30 hover:bg-accent/50"
                            )}
                          >
                            {/* Cover */}
                            <div
                              className="size-12 rounded-xl grid place-items-center text-2xl shrink-0 shadow-md"
                              style={{ background: trip.coverColor || "#f97316" }}
                            >
                              {trip.coverEmoji || "🌏"}
                            </div>
                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm truncate">{trip.title}</div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Users className="size-2.5" /> {trip.members?.length || 0}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="size-2.5" /> {new Date(trip.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                                </span>
                                {trip.status === "active" && (
                                  <span className="text-green-600 font-medium">● активна</span>
                                )}
                              </div>
                            </div>
                            {/* Current indicator */}
                            {trip.id === currentTripId && (
                              <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                                текущая
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">У вас пока нет поездок</p>
                      </div>
                    )}

                    {/* Кнопка создать из шаблона */}
                    <button
                      onClick={() => { setOpen(false); setTemplateOpen(true); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-primary/10 to-rose-500/10 border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/15 transition-colors mt-3"
                    >
                      <Sparkles className="size-5 text-primary" />
                      <span className="text-sm font-medium">Создать из шаблона</span>
                    </button>

                    {/* Кнопка создать */}
                    <button
                      onClick={() => setShowCreate(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:text-primary transition-colors mt-2"
                    >
                      <Plus className="size-5" />
                      <span className="text-sm font-medium">Создать с нуля</span>
                    </button>

                    {/* Кнопка присоединиться */}
                    <button
                      onClick={() => router.push("/join")}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary hover:bg-accent transition-colors mt-2"
                    >
                      <span className="text-sm font-medium">Присоединиться по коду</span>
                      <ArrowRight className="size-4" />
                    </button>

                    {/* Premium кнопка */}
                    <button
                      onClick={() => setPremiumOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium mt-2"
                    >
                      <Crown className="size-4" />
                      <span className="text-sm">Premium</span>
                    </button>
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

// Форма создания поездки
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
  const [startDate, setStartDate] = useState("");
  const [totalDays, setTotalDays] = useState("12");
  const [totalBudget, setTotalBudget] = useState("1100");
  const [emoji, setEmoji] = useState("🌏");
  const [color, setColor] = useState("#f97316");

  const EMOJIS = ["🌏", "🗾", "🇨🇳", "🇯🇵", "🇹🇭", "🇻🇳", "🇰🇷", "🏖️", "🏔️", "🗽", "🗼", "🏯"];
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
      totalDays: parseInt(totalDays) || 12,
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
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          ← Назад
        </button>
      </div>

      {/* Превью */}
      <div className="flex items-center justify-center gap-3 py-2">
        <div
          className="size-16 rounded-2xl grid place-items-center text-3xl shadow-lg transition-all"
          style={{ background: color }}
        >
          {emoji}
        </div>
      </div>

      {/* Выбор эмодзи */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            className={cn(
              "size-9 rounded-lg text-xl grid place-items-center transition-all",
              emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
            )}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Выбор цвета */}
      <div className="flex gap-1.5 justify-center">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "size-8 rounded-full transition-all",
              color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Название */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Название поездки *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Япония — Токио и Киото"
          autoFocus
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
        />
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

      {/* Дата + дни + бюджет */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Старт *</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Дней</label>
          <input
            type="number"
            value={totalDays}
            onChange={(e) => setTotalDays(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Бюджет $</label>
          <input
            type="number"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2 text-sm"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {loading ? "Создание…" : "Создать поездку"}
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
