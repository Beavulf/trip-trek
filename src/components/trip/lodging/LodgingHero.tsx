"use client";

// Герой вкладки «Жильё»: главное — ответ на вопрос «где я ночую». Три состояния:
// сейчас живём (крупно + действия для дороги), ещё не заехали (обратный отсчёт),
// все ночёвки позади (итог). Всегда тёмный «ночной» градиент: так белый текст
// читается и в светлой теме, и мобильный экран не слепит вечером в такси.

import { motion, useReducedMotion } from "framer-motion";
import { Moon } from "lucide-react";
import { fmtMoney, plural } from "@/lib/utils";
import {
  currentLodging,
  daysBetween,
  formatDayMonth,
  formatStayRange,
  nextLodging,
  nightNumber,
  nightsOf,
  toDateKey,
  type Lodging,
} from "@/lib/lodging";
import { StayActions } from "./stay-actions";

interface LodgingHeroProps {
  lodgings: Lodging[];
  todayKey: string;
  currencySymbol: string;
  /** Последний день поездки уже прошёл: «ночёвки позади» говорим только тогда */
  tripEnded: boolean;
  /** Добавить жильё на сегодня (нет у зрителя) — кнопка в состоянии «жилья на сегодня нет» */
  onAddToday?: () => void;
  onTaxi: (l: Lodging) => void;
}

export function LodgingHero({ lodgings, todayKey, currencySymbol, tripEnded, onAddToday, onTaxi }: LodgingHeroProps) {
  const reduceMotion = useReducedMotion();
  const now = currentLodging(lodgings, todayKey);
  const next = nextLodging(lodgings, todayKey);

  let eyebrow: string;
  let title: string;
  let lines: string[] = [];
  let focus: Lodging | undefined;

  if (now) {
    focus = now;
    const nights = nightsOf(now);
    const leaveIn = daysBetween(todayKey, toDateKey(now.checkOut));
    eyebrow = "🌙 Сегодня ночуем здесь";
    title = now.name;
    lines = [
      [now.city, nights > 1 ? `ночь ${nightNumber(now, todayKey)} из ${nights}` : null].filter(Boolean).join(" · "),
      leaveIn === 1
        ? `Завтра выезд${now.checkOutTime ? ` до ${now.checkOutTime}` : ""}`
        : `До ${formatDayMonth(toDateKey(now.checkOut))}`,
    ].filter(Boolean);
  } else if (next) {
    focus = next;
    const inDays = daysBetween(todayKey, toDateKey(next.checkIn));
    eyebrow = "✈️ Ближайшее заселение";
    title = next.name;
    lines = [
      inDays === 1 ? "Завтра" : `Через ${inDays} ${plural(inDays, "день", "дня", "дней")}`,
      [next.city, formatStayRange(next)].filter(Boolean).join(" · "),
    ];
  } else if (!tripEnded) {
    // Поездка идёт, а жильё на сегодня (и дальше) не указано — не «ночёвки позади»
    eyebrow = "🌙 Сегодня";
    title = "Жильё на эту ночь не указано";
    lines = ["Добавьте, где ночуете: адрес будет под рукой, а таксисту покажем одним нажатием"];
  } else {
    const nights = lodgings.reduce((s, l) => s + nightsOf(l), 0);
    const total = lodgings.reduce((s, l) => s + (l.price ?? 0), 0);
    eyebrow = "🏁 Ночёвки позади";
    title = `${lodgings.length} ${plural(lodgings.length, "проживание", "проживания", "проживаний")}`;
    lines = [
      `${nights} ${plural(nights, "ночь", "ночи", "ночей")} в пути`,
      total > 0 ? `На жильё ушло ${currencySymbol}${fmtMoney(total)}` : "",
    ].filter(Boolean);
  }

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Где ночуем"
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl bg-gradient-to-br from-indigo-600 via-purple-700 to-stone-900"
    >
      {/* Луна и мягкое пятно света — в духе героя обзора */}
      <Moon className="absolute -top-4 -right-3 size-32 opacity-10 rotate-12" aria-hidden />
      <div className="absolute -bottom-12 -left-8 size-40 rounded-full opacity-10 blur-2xl bg-white" aria-hidden />

      <div className="relative space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/75">{eyebrow}</p>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight break-words">{title}</h2>
          {focus?.nameLocal && <p className="text-sm text-white/70 break-words">{focus.nameLocal}</p>}
          {lines.map((line) => (
            <p key={line} className="text-sm text-white/85">
              {line}
            </p>
          ))}
          {focus?.address && <p className="text-xs text-white/65 break-words pt-1">{focus.address}</p>}
        </div>
        {focus && <StayActions lodging={focus} tone="hero" onTaxi={() => onTaxi(focus)} />}
        {!focus && !tripEnded && onAddToday && (
          <button
            type="button"
            onClick={onAddToday}
            className="w-full min-h-12 rounded-xl bg-white text-indigo-950 text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-white/90 active:scale-[0.97] transition-transform"
          >
            + Добавить жильё
          </button>
        )}
      </div>
    </motion.section>
  );
}
