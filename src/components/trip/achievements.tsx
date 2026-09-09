"use client";

import { useTrip, useExpenses, useFoods, useChecklist, useCurrentTripId } from "@/hooks/use-trip";
import { motion } from "framer-motion";
import { Trophy, Target, Share2, Loader2, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import {
  computeBadges,
  describeBadge,
  closestBadge,
  rankFor,
  type Badge,
} from "@/lib/achievements";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

/* ---------- утилиты ---------- */

type Filter = "all" | "unlocked" | "locked";

const seenKey = (tripId: string) => `tt-badges-seen-${tripId}`;

function loadSeen(tripId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(tripId));
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveSeen(tripId: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(tripId), JSON.stringify(ids));
  } catch {
    /* приватный режим — просто без празднования */
  }
}

function buzz(pattern: number | number[] = 35) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* не все браузеры умеют */
  }
}

function unitWord(unit: [string, string, string], n: number): string {
  return plural(n, unit[0], unit[1], unit[2]);
}

/** «Ещё 2 фото — и «Фотограф» ваш» */
function remainingLine(b: Badge, sym: string): string {
  const remaining = b.target - b.current;
  if (b.id === "big-spender") return `Ещё ${sym}${remaining} — и «${b.title}» ваш`;
  if (!b.unit) return describeBadge(b, sym);
  return `Ещё ${remaining} ${unitWord(b.unit, remaining)} — и «${b.title}» ваш`;
}

/** Нативный шеринг → буфер обмена (как на странице «Еда»).
    В вебвью мессенджеров clipboard API часто запрещён — есть execCommand-фолбэк. */
async function shareText(text: string, title: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }
  const copied =
    (() => {
      try {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
      } catch {
        return Promise.resolve(false);
      }
    })();
  if (await copied) {
    toast.success("Скопировано в буфер");
    return;
  }
  // Легаси-фолбэк: скрытая textarea + execCommand('copy')
  let legacyOk = false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    try {
      ta.select();
      legacyOk = document.execCommand("copy");
    } finally {
      ta.remove();
    }
  } catch {
    /* фолбэк тоже не сработал */
  }
  if (legacyOk) {
    toast.success("Скопировано в буфер");
    return;
  }
  toast.error("Не удалось поделиться");
}

/* ---------- страница ---------- */

export function Achievements() {
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen, setActiveTab } = useTripStore();
  const { data: trip, error: tripError, isLoading: tripLoading, refetch: refetchTrip } = useTrip();
  const { data: expenses, error: expensesError, isLoading: expensesLoading, refetch: refetchExpenses } = useExpenses();
  const { data: foods, isLoading: foodsLoading } = useFoods();
  const { data: checklist, isLoading: checklistLoading } = useChecklist();

  const [filter, setFilter] = useState<Filter>("all");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);

  const ready = Boolean(tripId && trip && !tripLoading && !expensesLoading && !foodsLoading && !checklistLoading);

  const badges = useMemo(() => {
    if (!trip) return [];
    const triedFoods = foods?.filter((f) => f.tried).length ?? 0;
    const totalFoods = foods?.length ?? 0;
    const checklistDone = checklist?.filter((i) => i.done).length ?? 0;
    const checklistTotal = checklist?.length ?? 0;
    const realExpenses = expenses?.filter((e) => e.category !== "settlement") ?? [];
    const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
    return computeBadges({
      visitedPlaces: trip.visitedPlaces,
      totalPlaces: trip.totalPlaces,
      totalPhotos: trip.totalPhotos,
      totalJournals: trip.totalJournals,
      totalSpent,
      triedFoods,
      totalFoods,
      currentDay: trip.currentDayNumber,
      totalDays: trip.settings.totalDays,
      checklistDone,
      checklistTotal,
      currency: trip.settings.currency,
      tripStatus: trip.trip?.status ?? "planning",
    });
  }, [trip, expenses, foods, checklist]);

  const sym = currencySymbol(trip?.settings.currency ?? "USD");
  const { unlocked, locked } = useMemo(() => split(badges), [badges]);
  const next = useMemo(() => closestBadge(badges), [badges]);
  const rank = rankFor(unlocked.length, badges.length);

  /** Полученные сверху (в каноническом порядке), дальше — по близости к получению */
  const visible = useMemo(() => {
    if (filter === "unlocked") return unlocked;
    if (filter === "locked") return [...locked].sort((a, b) => b.pct - a.pct);
    return [...unlocked, ...[...locked].sort((a, b) => b.pct - a.pct)];
  }, [filter, unlocked, locked]);

  const sheetBadge = useMemo(() => badges.find((b) => b.id === sheetId) ?? null, [badges, sheetId]);

  /* Празднование: бейдж получен с прошлого визита → toast + вибро + подсветка карточки.
     Первый визит без сохранённого набора — просто запоминаем, без фейерверка. */
  const badgesRef = useRef(badges);
  badgesRef.current = badges;
  const unlockedKey = badges.filter((b) => b.unlocked).map((b) => b.id).join(",");
  // Подсветка «новых» бейджей не должна перетекать между поездками
  useEffect(() => {
    setFreshIds([]);
  }, [tripId]);
  useEffect(() => {
    if (!tripId || !ready || badgesRef.current.length === 0) return;
    const list = badgesRef.current;
    const unlockedIds = list.filter((b) => b.unlocked).map((b) => b.id);
    const seen = loadSeen(tripId);
    if (!seen) {
      saveSeen(tripId, unlockedIds);
      return;
    }
    const fresh = unlockedIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    saveSeen(tripId, unlockedIds);
    setFreshIds(fresh);
    buzz([30, 40, 30]);
    if (fresh.length <= 3) {
      fresh.forEach((id) => {
        const b = list.find((x) => x.id === id);
        if (b) toast.success(`🎉 Новая награда: ${b.title}`, { description: describeBadge(b, sym) });
      });
    } else {
      toast.success(`🎉 Новых наград: ${fresh.length}`, {
        description: fresh.slice(0, 5).map((id) => list.find((x) => x.id === id)?.title).filter(Boolean).join(" · "),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, ready, unlockedKey]);

  const shareCollection = () => {
    const title = trip?.settings.title;
    const lines = [`🏅 Награды${title ? ` «${title}»` : ""}: ${unlocked.length} из ${badges.length}`, ""];
    if (unlocked.length > 0) {
      unlocked.forEach((b) => lines.push(`✓ ${b.title}`));
      lines.push("");
    }
    if (next) {
      lines.push(`🎯 Следующая цель: ${next.title} (${next.pct}%)`);
    } else {
      lines.push("Коллекция собрана полностью! 🏆");
    }
    void shareText(lines.join("\n"), "Награды поездки");
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError || expensesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2 animate-fade-up">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">{tripError ? "Не удалось загрузить поездку" : "Не удалось загрузить данные"}</p>
        <button
          type="button"
          onClick={() => (tripError ? refetchTrip() : refetchExpenses())}
          className="mt-2 min-h-11 rounded-lg bg-primary px-4 py-2 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (!ready) {
    return <AchievementsSkeleton />;
  }

  const allDone = badges.length > 0 && unlocked.length === badges.length;

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Герой: коллекция компании */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">{rank.emoji}</div>
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-white/75">
              <Trophy className="size-3.5 shrink-0" /> Награды поездки
            </div>
            <button
              type="button"
              onClick={shareCollection}
              aria-label="Поделиться коллекцией наград"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur transition-transform active:scale-95"
            >
              <Share2 className="size-4" />
            </button>
          </div>
          <h1 className="mt-1 text-3xl font-bold tabular-nums">
            {unlocked.length} <span className="text-white/60 text-xl font-semibold">из {badges.length}</span>
          </h1>
          <p className="mt-0.5 text-sm text-white/85">
            {rank.emoji} Звание компании: <b>{rank.title}</b>
          </p>
          <div className="mt-3 h-1.5 max-w-[240px] overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
              style={{ width: `${badges.length > 0 ? (unlocked.length / badges.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-white/60">
            {allDone ? "Вся коллекция у вас!" : "Коллекция общая — награды зарабатываем вместе"}
          </p>
        </div>
      </div>

      {/* Прожектор: ближайшая награда */}
      {next && <NextBadgePlaque badge={next} sym={sym} onGo={(tab) => setActiveTab(tab)} />}
      {allDone && (
        <div className="rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm">Коллекция собрана!</div>
              <div className="text-xs text-muted-foreground">Вы легенды этой поездки — все {badges.length} наград ваши</div>
            </div>
          </div>
          <button
            type="button"
            onClick={shareCollection}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          >
            <Share2 className="size-4" /> Похвастаться коллекцией
          </button>
        </div>
      )}

      {/* Фильтры */}
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            { key: "all", label: "Все", count: badges.length },
            { key: "unlocked", label: "Полученные", count: unlocked.length },
            { key: "locked", label: "В процессе", count: locked.length },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            aria-label={`Показать: ${f.label}, ${f.count}`}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-accent"
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", filter === f.key ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Сетка бейджей */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {visible.map((a, i) => (
            <AchievementCard
              key={a.id}
              badge={a}
              index={i}
              sym={sym}
              fresh={freshIds.includes(a.id)}
              onOpen={() => setSheetId(a.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <div className="text-2xl mb-1">🧭</div>
          <p className="text-sm text-muted-foreground">
            {filter === "unlocked" ? "Пока пусто — всё впереди" : "Всё получено — попробуйте фильтр «Все»"}
          </p>
        </div>
      )}

      {/* Шторка награды */}
      <AchievementSheet
        badge={sheetBadge}
        sym={sym}
        tripTitle={trip?.settings.title}
        onClose={() => setSheetId(null)}
        onGo={(tab) => {
          setSheetId(null);
          setActiveTab(tab);
        }}
      />
    </div>
  );
}

function split(badges: Badge[]) {
  return {
    unlocked: badges.filter((b) => b.unlocked),
    locked: badges.filter((b) => !b.unlocked),
  };
}

/* ---------- прожектор ---------- */

function NextBadgePlaque({ badge, sym, onGo }: { badge: Badge; sym: string; onGo: (tab: TripTab) => void }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <Target className="size-4 self-center text-orange-500" />
        <h2 className="text-sm font-semibold">До следующей награды</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{badge.pct}%</span>
      </div>
      <div
        className="rounded-3xl border p-4 relative overflow-hidden"
        style={{ background: `${badge.color}0d`, borderColor: `${badge.color}44` }}
      >
        <div className="absolute -top-3 -right-3 size-16 rounded-full opacity-20 blur-xl" style={{ background: badge.color }} />
        <div className="relative flex items-start gap-3">
          <div
            className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl"
            style={{ background: `${badge.color}22` }}
          >
            {badge.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm leading-tight">{badge.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{remainingLine(badge, sym)}</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 max-w-[160px] overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={badge.current} aria-valuemin={0} aria-valuemax={badge.target}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${badge.pct}%`, background: badge.color }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {badge.current} / {badge.target}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onGo(badge.cta.tab)}
          className="relative mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          style={{ background: badge.color }}
        >
          {badge.cta.label} <ArrowRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

/* ---------- карточка в сетке ---------- */

function AchievementCard({ badge, index, sym, fresh, onOpen }: {
  badge: Badge;
  index: number;
  sym: string;
  fresh: boolean;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), type: "spring", stiffness: 300, damping: 25 }}
      onClick={onOpen}
      aria-label={`${badge.title}. ${badge.unlocked ? "Получено" : `Прогресс ${badge.current} из ${badge.target}`}. Открыть детали`}
      className={cn(
        "rounded-2xl border p-3 text-center relative overflow-hidden",
        badge.unlocked
          ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/40"
          : "bg-card border-border",
        fresh && "badge-fresh border-amber-400"
      )}
    >
      {badge.unlocked && (
        <div className="absolute -top-2 -right-2 size-12 rounded-full opacity-20 blur-xl" style={{ background: badge.color }} />
      )}
      <div className="relative">
        <div
          className={cn(
            "size-14 mx-auto rounded-2xl grid place-items-center text-3xl mb-2",
            !badge.unlocked && "grayscale opacity-60"
          )}
          style={{ background: badge.unlocked ? `${badge.color}22` : "hsl(var(--muted))" }}
        >
          {badge.emoji}
        </div>
        <div className="font-semibold text-xs leading-tight line-clamp-2 min-h-[2em]">{badge.title}</div>
        {!badge.unlocked && badge.target > 0 && (
          <div className="mt-1.5">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={badge.current} aria-valuemin={0} aria-valuemax={badge.target}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${badge.pct}%`, background: badge.color }}
              />
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
              {badge.current} / {badge.target}
            </div>
          </div>
        )}
        {badge.unlocked && (
          <div className="mt-1 text-[10px] font-semibold flex items-center justify-center gap-0.5" style={{ color: badge.color }}>
            <CheckCircle2 className="size-3" /> Получено
          </div>
        )}
      </div>
    </motion.button>
  );
}

/* ---------- шторка детали ---------- */

function AchievementSheet({ badge, sym, tripTitle, onClose, onGo }: {
  badge: Badge | null;
  sym: string;
  tripTitle?: string;
  onClose: () => void;
  onGo: (tab: TripTab) => void;
}) {
  const shareBadge = () => {
    if (!badge) return;
    const status = badge.unlocked
      ? `✅ Получена${tripTitle ? ` в поездке «${tripTitle}»` : ""}`
      : `🎯 Цель: ${describeBadge(badge, sym)} (${badge.pct}%)${tripTitle ? ` · «${tripTitle}»` : ""}`;
    void shareText(`${badge.emoji} Награда «${badge.title}»\n${status}`, badge.title);
  };

  return (
    <MobileBottomSheet
      open={Boolean(badge)}
      onOpenChange={(v) => !v && onClose()}
      title={badge?.title ?? ""}
      titleIcon={badge ? <span aria-hidden>{badge.emoji}</span> : undefined}
    >
      {badge && (
        <div className="space-y-4">
          {/* Медаль */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "grid size-24 place-items-center rounded-3xl text-5xl shadow-sm",
                !badge.unlocked && "grayscale opacity-70"
              )}
              style={{ background: `${badge.color}22` }}
            >
              {badge.emoji}
            </div>
            {badge.unlocked ? (
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
                <CheckCircle2 className="size-3.5" /> Получено
              </span>
            ) : (
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                🔒 В процессе · {badge.pct}%
              </span>
            )}
            <p className="mt-2 text-sm text-muted-foreground max-w-[260px]">{describeBadge(badge, sym)}</p>
          </div>

          {/* Прогресс */}
          {!badge.unlocked && badge.target > 0 && (
            <div className="rounded-2xl border border-border p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Прогресс</span>
                <span className="font-bold tabular-nums">
                  {badge.current} / {badge.target}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={badge.current} aria-valuemin={0} aria-valuemax={badge.target}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${badge.pct}%`, background: badge.color }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{remainingLine(badge, sym)}</p>
            </div>
          )}

          {/* Действие */}
          {badge.unlocked ? (
            <button
              type="button"
              onClick={shareBadge}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <Share2 className="size-4" /> Поделиться наградой
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onGo(badge.cta.tab)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ background: badge.color }}
              >
                {badge.cta.label} <ArrowRight className="size-4" />
              </button>
              <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <Sparkles className="size-3" /> Награда общая — закроется для всей компании
              </p>
            </>
          )}
        </div>
      )}
    </MobileBottomSheet>
  );
}

/* ---------- скелет ---------- */

function AchievementsSkeleton() {
  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl animate-pulse">
        <div className="h-3 w-32 rounded bg-white/30" />
        <div className="mt-2 h-8 w-24 rounded bg-white/40" />
        <div className="mt-3 h-1.5 w-48 rounded bg-white/30" />
      </div>
      <div className="rounded-3xl border border-border p-4 animate-pulse">
        <div className="flex gap-3">
          <div className="size-14 rounded-2xl bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted" />
          </div>
        </div>
        <div className="mt-3 h-11 rounded-xl bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border p-3 animate-pulse">
            <div className="size-14 mx-auto rounded-2xl bg-muted" />
            <div className="mt-2 mx-auto h-3 w-16 rounded bg-muted" />
            <div className="mt-2 h-1.5 rounded-full bg-muted" />
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Загружаем награды…
      </p>
    </div>
  );
}
