"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Dices, Loader2, MapPin, Navigation, Share2, Star } from "lucide-react";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { useUpdatePlace } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { CATEGORY_META, type Day, type Place } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { toast } from "sonner";
import { cn, haptic } from "@/lib/utils";
import type { WishlistItem } from "./types";
import { loadWishlist, saveWishlist } from "@/lib/wishlist";
import { shareOrCopy, osmDirectionsUrl } from "./share";

export type FateCandidate =
  | { source: "route"; place: Place; day: Day }
  | { source: "wish"; item: WishlistItem };

interface FateCupProps {
  /** Непосещённые кандидаты: места маршрута + wishlist */
  candidates: FateCandidate[];
  progressPct: number;
  currency: string;
  onGoWishlist: () => void;
  /** Есть ли вообще места (маршрут + wishlist) — для честного пустого состояния */
  hasAnyPlaces: boolean;
}

/**
 * «Чашка судьбы» — сигнатурный элемент страницы.
 * Чашка наливается чаем по мере посещения мест (progressPct),
 * тап — «заваривание»: случайное место из непосещённых в шторке.
 */
export function FateCup({ candidates, progressPct, currency, onGoWishlist, hasAnyPlaces }: FateCupProps) {
  const reduceMotion = useReducedMotion();
  const [brewing, setBrewing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picked, setPicked] = useState<FateCandidate | null>(null);
  const [justMarked, setJustMarked] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const emptyPool = candidates.length === 0;

  const pickRandom = (): FateCandidate | null => {
    const pool = candidatesRef.current;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Тап по чашке: завариваем (встряска + пар) и открываем шторку с результатом
  const brew = () => {
    if (brewing) return;
    haptic(10);
    if (emptyPool) {
      setPicked(null);
      setJustMarked(false);
      setSheetOpen(true);
      return;
    }
    if (reduceMotion) {
      setPicked(pickRandom());
      setJustMarked(false);
      setSheetOpen(true);
      return;
    }
    setBrewing(true);
    timerRef.current = setTimeout(() => {
      setPicked(pickRandom());
      setJustMarked(false);
      setBrewing(false);
      setSheetOpen(true);
      haptic(15);
    }, 850);
  };

  // «Другое место» из шторки: короткое перезаваривание, шторка не закрывается
  const reroll = () => {
    if (rerolling) return;
    haptic(8);
    setRerolling(true);
    timerRef.current = setTimeout(() => {
      setPicked(pickRandom());
      setJustMarked(false);
      setRerolling(false);
    }, reduceMotion ? 0 : 450);
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={brew}
        aria-label={`Чашка судьбы: выбрать случайное место. Прогресс отдыха ${progressPct}%`}
        animate={
          brewing && !reduceMotion
            ? { rotate: [0, -6, 6, -5, 5, -2, 0], y: [0, 1, -1, 0] }
            : { rotate: 0, y: 0 }
        }
        transition={{ duration: 0.8, ease: "easeInOut" }}
        whileTap={{ scale: 0.92 }}
        className="relative shrink-0 w-[92px] h-[96px] -mr-1 grid place-items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded-2xl"
      >
        <CupSvg progressPct={progressPct} brewing={brewing} reduceMotion={!!reduceMotion} />
      </motion.button>

      <FateSheet
        open={sheetOpen}
        picked={picked}
        justMarked={justMarked}
        setJustMarked={setJustMarked}
        rerolling={rerolling}
        currency={currency}
        emptyPool={emptyPool}
        hasAnyPlaces={hasAnyPlaces}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) setPicked(null);
        }}
        onReroll={reroll}
        onGoWishlist={() => {
          setSheetOpen(false);
          onGoWishlist();
        }}
      />
    </>
  );
}

/* ================= SVG чашки ================= */

function CupSvg({
  progressPct,
  brewing,
  reduceMotion,
}: {
  progressPct: number;
  brewing: boolean;
  reduceMotion: boolean;
}) {
  // Уровень чая: 26 (полная) … 58 (почти пусто, тонкий слой на дне)
  const FULL_Y = 26;
  const EMPTY_Y = 58;
  const p = Math.min(100, Math.max(0, progressPct)) / 100;
  const surfaceY = FULL_Y + (1 - p) * (EMPTY_Y - FULL_Y);

  return (
    <svg viewBox="0 0 72 78" className="w-full h-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="fateTea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
        <clipPath id="fateCupClip">
          <path d="M15 25 L45 25 L41.8 56 Q41.3 60 37 60 L23 60 Q18.7 60 18.2 56 Z" />
        </clipPath>
      </defs>

      {/* Пар — две струйки; при заваривании гуще и быстрее */}
      {!reduceMotion && (
        <g>
          {[23, 33].map((x, i) => (
            <motion.rect
              key={x}
              x={x}
              y={14}
              width={2.6}
              height={9}
              rx={1.3}
              fill="white"
              animate={
                brewing
                  ? { y: [0, -11], opacity: [0, 0.95, 0], scaleY: [1, 1.8] }
                  : { y: [0, -8], opacity: [0, 0.5, 0], scaleY: [1, 1.35] }
              }
              transition={{
                duration: brewing ? 0.85 : 3,
                repeat: Infinity,
                delay: brewing ? i * 0.15 : i * 1.4,
                ease: "easeOut",
              }}
            />
          ))}
        </g>
      )}

      {/* Ручка */}
      <path
        d="M45 31 Q57 32 55 41 Q53 49 43.5 48"
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth={2.6}
        strokeLinecap="round"
      />

      {/* Чай — уровень анимируется пружиной, как настоящая жидкость */}
      <g clipPath="url(#fateCupClip)">
        <motion.g animate={{ y: surfaceY }} transition={{ type: "spring", stiffness: 55, damping: 14 }}>
          <rect x="12" y="0" width="36" height="66" fill="url(#fateTea)" />
          <rect x="12" y="0" width="36" height="3.4" rx="1.7" fill="#FDE68A" opacity="0.95" />
        </motion.g>
        <rect x="18" y="28" width="3" height="26" rx="1.5" fill="white" opacity="0.16" />
      </g>

      {/* Корпус */}
      <path
        d="M15 25 L45 25 L41.8 56 Q41.3 60 37 60 L23 60 Q18.7 60 18.2 56 Z"
        fill="rgba(255,255,255,0.10)"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <line x1="14" y1="25" x2="46" y2="25" stroke="rgba(255,255,255,0.9)" strokeWidth={2.6} strokeLinecap="round" />

      {/* Блюдце */}
      <ellipse cx="30" cy="65" rx="21" ry="4.2" fill="rgba(255,255,255,0.22)" />
      <ellipse cx="30" cy="65" rx="21" ry="4.2" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1.4} />
    </svg>
  );
}

/* ================= Шторка результата ================= */

function FateSheet({
  open,
  picked,
  justMarked,
  setJustMarked,
  rerolling,
  currency,
  emptyPool,
  hasAnyPlaces,
  onOpenChange,
  onReroll,
  onGoWishlist,
}: {
  open: boolean;
  picked: FateCandidate | null;
  justMarked: boolean;
  setJustMarked: (v: boolean) => void;
  rerolling: boolean;
  currency: string;
  emptyPool: boolean;
  hasAnyPlaces: boolean;
  onOpenChange: (v: boolean) => void;
  onReroll: () => void;
  onGoWishlist: () => void;
}) {
  const update = useUpdatePlace();
  const { data: session } = useAuth();
  const userName = (session?.user as { name?: string } | undefined)?.name || "Кто-то";
  const sym = currencySymbol(currency);

  const emoji = useMemo(() => {
    if (!picked) return "🍵";
    if (picked.source === "route") return CATEGORY_META[picked.place.category]?.emoji ?? "🍵";
    const cat = picked.item.category;
    return cat === "cafe" ? "☕" : cat === "bar" ? "🍸" : cat === "restaurant" ? "🍽️" : "✨";
  }, [picked]);

  const name = picked ? (picked.source === "route" ? picked.place.name : picked.item.name) : "";
  const coords = picked
    ? picked.source === "route"
      ? { lat: picked.place.lat, lng: picked.place.lng }
      : typeof picked.item.lat === "number" && typeof picked.item.lng === "number"
        ? { lat: picked.item.lat, lng: picked.item.lng }
        : null
    : null;
  const directions = coords ? osmDirectionsUrl(coords.lat, coords.lng) : null;

  const share = () => {
    if (!picked) return;
    shareOrCopy(`Идём: ${name}`, directions ?? "", name);
  };

  // Отметить посещённым прямо из шторки: маршрут → API, wishlist → localStorage
  const markVisited = () => {
    if (!picked || justMarked) return;
    haptic(12);
    if (picked.source === "route") {
      update.mutate(
        { id: picked.place.id, status: "visited", userName },
        {
          onSuccess: () => {
            setJustMarked(true);
            toast("Отдохнули! 🍵", { description: picked.place.name });
          },
          onError: (err) => {
            toast.error("Не удалось обновить", {
              description: err instanceof Error ? err.message : "Попробуйте ещё раз",
            });
          },
        }
      );
    } else {
      const items = loadWishlist();
      saveWishlist(items.map((i) => (i.id === picked.item.id ? { ...i, visited: true } : i)));
      setJustMarked(true);
      toast("Отдохнули! 🍵", { description: picked.item.name });
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Чашка судьбы"
      titleIcon={<Dices className="size-5 text-primary" />}
    >
      {!picked ? (
        <div className="text-center py-8 space-y-3">
          {/* 🍵 вместо 🫖: чайник — Emoji 13.0, на Windows 10 не рендерится (квадрат) */}
          <div className="text-5xl">{hasAnyPlaces ? "🎉" : "🍵"}</div>
          <p className="text-sm font-medium">
            {hasAnyPlaces ? "Всё посещено — красавчики!" : "Пока нет мест для выбора"}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {hasAnyPlaces
              ? "Непосещённых мест не осталось. Добавьте новое в «Хочу» или найдите рядом."
              : "Добавьте кафе, бар или ресторан в Маршрут, сохраните в «Хочу» или найдите рядом."}
          </p>
          <button
            type="button"
            onClick={onGoWishlist}
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl bg-primary text-primary-foreground min-h-11"
          >
            <Star className="size-3.5" /> Открыть «Хочу»
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-14 rounded-2xl grid place-items-center text-3xl bg-amber-500/10 shrink-0">
              {emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-lg leading-tight">{name}</h3>
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-primary/10 text-primary">
                  {picked.source === "route" ? "Из маршрута" : "Из «Хочу»"}
                </span>
                {picked.source === "route" && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                    <MapPin className="size-2.5" /> День {picked.day.dayNumber} · {picked.day.city}
                  </span>
                )}
                {picked.source === "wish" && picked.item.address && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0">
                    <MapPin className="size-2.5 shrink-0" />
                    <span className="line-clamp-1">{picked.item.address}</span>
                  </span>
                )}
              </div>
              {picked.source === "route" && picked.place.budget ? (
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  ≈ {sym}
                  {picked.place.budget} с человека
                </p>
              ) : null}
            </div>
          </div>

          {picked.source === "route" && picked.place.description && (
            <p className="text-xs text-muted-foreground line-clamp-3">{picked.place.description}</p>
          )}
          {picked.source === "wish" && picked.item.note && (
            <p className="text-xs text-muted-foreground line-clamp-3">{picked.item.note}</p>
          )}

          {/* Основные действия: навигация + шеринг */}
          <div className="flex gap-2">
            {directions ? (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Navigation className="size-4" /> Как добраться
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground px-3 py-2.5 text-sm font-semibold"
              >
                Закрыть
              </button>
            )}
            <button
              type="button"
              onClick={share}
              aria-label="Поделиться местом"
              className="size-11 shrink-0 grid place-items-center rounded-xl bg-muted text-foreground hover:bg-accent transition-colors"
            >
              <Share2 className="size-4" />
            </button>
          </div>

          {/* Второй ряд: отметить + перезаварить */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={markVisited}
              disabled={justMarked || update.isPending}
              className={cn(
                "flex-1 min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-80",
                justMarked
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
              )}
            >
              <CheckCircle2 className="size-4" />
              {justMarked ? "Отмечено ✓" : "Мы тут! Отметить"}
            </button>
            <button
              type="button"
              onClick={onReroll}
              disabled={rerolling}
              className="flex-1 min-h-11 rounded-xl bg-muted px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-accent transition-colors disabled:opacity-70"
            >
              {rerolling ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
              Другое место
            </button>
          </div>
        </div>
      )}
    </MobileBottomSheet>
  );
}
