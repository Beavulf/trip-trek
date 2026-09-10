"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Lock, Stamp } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import type { UserProfile } from "./types";

type Stats = UserProfile["stats"];

interface ProgressDef {
  cur: (s: Stats) => number;
  target: number;
  unit: [string, string, string];
  money?: boolean;
}

// Прогресс по каждому штампу считается из глобальной статистики пользователя
const PROGRESS: Record<string, ProgressDef> = {
  "Первое путешествие": { cur: (s) => s.trips, target: 1, unit: ["поездку", "поездки", "поездок"] },
  "Исследователь": { cur: (s) => s.trips, target: 3, unit: ["поездку", "поездки", "поездок"] },
  "Глобал-тревелер": { cur: (s) => s.trips, target: 5, unit: ["поездку", "поездки", "поездок"] },
  "Фотограф": { cur: (s) => s.photos, target: 10, unit: ["фото", "фото", "фото"] },
  "Папарацци": { cur: (s) => s.photos, target: 50, unit: ["фото", "фото", "фото"] },
  "Дневник": { cur: (s) => s.journals, target: 5, unit: ["запись", "записи", "записей"] },
  "Летописец": { cur: (s) => s.journals, target: 20, unit: ["запись", "записи", "записей"] },
  "Шопоголик": { cur: (s) => Math.round(s.totalSpent), target: 100, unit: ["", "", ""], money: true },
  "Тяжеловес": { cur: (s) => Math.round(s.totalSpent), target: 1000, unit: ["", "", ""], money: true },
  "Болтун": { cur: (s) => s.messages, target: 10, unit: ["сообщение", "сообщения", "сообщений"] },
  "Оратор": { cur: (s) => s.messages, target: 50, unit: ["сообщение", "сообщения", "сообщений"] },
  "Маршрут": { cur: (s) => s.visitedPlaces, target: 10, unit: ["место", "места", "мест"] },
};

interface StampProgress {
  current: number;
  target: number;
  pct: number;
  needText: string | null;
}

function progressFor(a: { label: string }, stats: Stats): StampProgress | null {
  const def = PROGRESS[a.label];
  if (!def) return null; // Premium — не числовой штамп
  const current = Math.min(def.cur(stats), def.target);
  const pct = Math.min(100, Math.round((current / def.target) * 100));
  const left = def.target - def.cur(stats);
  const need = Math.max(0, left);
  const fmt = (n: number) => (def.money ? `$${n}` : `${n} ${plural(n, def.unit[0], def.unit[1], def.unit[2])}`);
  const needText =
    def.cur(stats) >= def.target
      ? null
      : def.money
        ? `Ещё $${need} — и оттиск ваш`
        : `Ещё ${fmt(need)} — и оттиск ваш`;
  return { current, target: def.target, pct, needText };
}

/** Круглый штамп: полученный — цветной оттиск, нет — пунктирный контур с кольцом прогресса */
function StampMark({
  emoji,
  unlocked,
  pct,
  size = 48,
}: {
  emoji: string;
  unlocked: boolean;
  pct: number;
  size?: number;
}) {
  const R = 21;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className={cn(unlocked && "-rotate-3")}>
      {unlocked ? (
        <>
          <circle cx="24" cy="24" r="22.5" fill="none" stroke="var(--color-amber-500)" strokeWidth="2.2" />
          <circle cx="24" cy="24" r="17.5" fill="none" stroke="var(--color-amber-500)" strokeWidth="1" opacity="0.7" />
          <text x="24" y="30" textAnchor="middle" fontSize="17">{emoji}</text>
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="22.5" fill="none" stroke="var(--border)" strokeWidth="1.8" strokeDasharray="4 3" />
          {/* кольцо прогресса — «штамп почти оттиснут» */}
          <circle
            cx="24" cy="24" r={R} fill="none"
            stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
            transform="rotate(-90 24 24)"
            opacity={pct > 0 ? 1 : 0}
          />
          <text x="24" y="30" textAnchor="middle" fontSize="15" opacity="0.45" style={{ filter: "grayscale(1)" }}>
            {emoji}
          </text>
        </>
      )}
    </svg>
  );
}

interface AchievementsGridProps {
  profile: UserProfile;
  onOpenPremium: () => void;
}

type AchievementWithProgress = UserProfile["achievements"][number] & { progress: StampProgress | null };

export function AchievementsGrid({ profile, onOpenPremium }: AchievementsGridProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const unlockedCount = profile.achievements.filter((a) => a.unlocked).length;

  const withProgress = useMemo(
    () =>
      profile.achievements.map((a, i) => ({
        ...a,
        idx: i,
        progress: a.unlocked ? null : progressFor(a, profile.stats),
      })),
    [profile]
  );

  // Прожектор: ближайший неоттиснутый штамп
  const spotlight = useMemo(() => {
    const locked = withProgress.filter((a) => !a.unlocked && a.progress);
    if (locked.length === 0) return null;
    return [...locked].sort((a, b) => (b.progress!.pct - a.progress!.pct))[0];
  }, [withProgress]);

  const selectedData = selected ? withProgress.find((a) => a.label === selected) : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Stamp className="size-4 text-amber-500" />
        <h3 className="font-semibold text-sm">Достижения</h3>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground tabular-nums">
          {unlockedCount} / {profile.achievements.length}
        </span>
      </div>

      {/* Прожектор: до следующего штампа */}
      {spotlight && spotlight.progress && (
        <button
          type="button"
          onClick={() => setSelected(spotlight.label)}
          className="w-full px-4 py-3 border-b border-border flex items-center gap-3 text-left hover:bg-accent/50 transition-colors"
        >
          <div className="shrink-0 rounded-full bg-amber-500/10 p-1.5">
            <StampMark emoji={spotlight.emoji} unlocked={false} pct={spotlight.progress.pct} size={44} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Ближайший штамп
            </div>
            <div className="font-semibold text-sm truncate">{spotlight.label}</div>
            <div className="text-xs text-primary font-medium mt-0.5">{spotlight.progress.needText}</div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                style={{ width: `${spotlight.progress.pct}%` }}
              />
            </div>
          </div>
        </button>
      )}

      {/* Сетка штампов */}
      <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {withProgress.map((a, i) => (
          <motion.button
            key={a.label}
            type="button"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.02 }}
            onClick={() => setSelected(a.label)}
            aria-label={`${a.label}: ${a.unlocked ? "получено" : a.progress ? `${a.progress.pct}%` : "не получено"}`}
            className={cn(
              "rounded-xl py-2 px-1 flex flex-col items-center gap-1 text-center transition-all active:scale-95",
              a.unlocked
                ? "bg-gradient-to-br from-amber-500/15 to-orange-500/5 border border-amber-500/25"
                : "border border-border/60 hover:bg-accent/40"
            )}
          >
            <StampMark emoji={a.emoji} unlocked={a.unlocked} pct={a.progress?.pct ?? 0} />
            <div
              className={cn(
                "text-[9px] font-medium leading-tight line-clamp-2 break-words w-full",
                !a.unlocked && "text-muted-foreground"
              )}
            >
              {a.label}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Шторка деталей */}
      {selectedData && (
        <AchievementSheet
          data={selectedData}
          onClose={() => setSelected(null)}
          onOpenPremium={onOpenPremium}
        />
      )}
    </motion.section>
  );
}

function AchievementSheet({
  data,
  onClose,
  onOpenPremium,
}: {
  data: AchievementWithProgress;
  onClose: () => void;
  onOpenPremium: () => void;
}) {
  return (
    <MobileBottomSheet open onOpenChange={onClose} title={data.label} titleIcon={<Stamp className="size-4 text-amber-500" />}>
      <div className="flex flex-col items-center text-center pt-2 pb-1">
        <div
          className={cn(
            "rounded-full p-3",
            data.unlocked ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10" : "bg-muted/60"
          )}
        >
          <StampMark emoji={data.emoji} unlocked={data.unlocked} pct={data.progress?.pct ?? 0} size={88} />
        </div>

        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold",
            data.unlocked ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
          )}
        >
          {data.unlocked ? "✓ Оттиснуто" : <><Lock className="size-3" /> Ещё не получено</>}
        </div>

        {data.progress ? (
          <>
            <div className="mt-4 w-full max-w-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="tabular-nums">
                  {data.progress.current} из {data.progress.target}
                </span>
                <span className="font-mono tabular-nums">{data.progress.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                  style={{ width: `${data.progress.pct}%` }}
                />
              </div>
            </div>
            {data.progress.needText && (
              <p className="mt-2 text-sm text-primary font-medium">{data.progress.needText}</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{data.req}</p>
        )}

        <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-xs">
          {data.unlocked ? "Штамп уже в паспорте — так держать!" : `Как получить: ${data.req}`}
        </p>

        {/* Premium-штамп ведёт в подписку */}
        {data.label === "Premium" && !data.unlocked && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPremium();
            }}
            className="mt-4 min-h-11 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-transform"
          >
            <Crown className="size-4" /> Открыть Premium
          </button>
        )}
      </div>
    </MobileBottomSheet>
  );
}
