"use client";

// Мини-макеты для шагов обучения: рисуются кодом (div/SVG/lucide) в токенах темы —
// автоматически под светлую/тёмную, почти не весят и не устаревают, в отличие от скриншотов.

import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Images,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MapPin,
  MessagesSquare,
  Plus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/onboarding";

function WelcomeArt() {
  const reduced = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center">
      {/* Пунктирный «перелёт» между двумя точками — маршрут как суть приложения */}
      <svg viewBox="0 0 280 120" className="absolute inset-0 size-full text-primary/50" fill="none" aria-hidden>
        <motion.path
          d="M36 94 C 92 22, 188 22, 244 86"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3 8"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}
        />
        <circle cx="36" cy="94" r="5" className="fill-primary" />
        <circle cx="244" cy="86" r="5" className="fill-violet-500" />
      </svg>
      <motion.div
        initial={reduced ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 via-rose-500 to-violet-500 text-xl font-bold text-white shadow-xl shadow-orange-500/25"
      >
        T
      </motion.div>
    </div>
  );
}

function TabsArt() {
  const icons = [LayoutDashboard, ListChecks, MapIcon, Wallet, Images, MessagesSquare];
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-card/90 px-2 py-2 shadow-xl backdrop-blur">
      {icons.map((Icon, i) => (
        <div
          key={i}
          className={cn(
            "grid size-9 place-items-center rounded-xl sm:size-10",
            i === 2 ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "text-muted-foreground/60"
          )}
        >
          <Icon className="size-4" />
        </div>
      ))}
    </div>
  );
}

function QuickAddArt() {
  const reduced = useReducedMotion();
  const chips = [
    { icon: MapPin, label: "Место" },
    { icon: Wallet, label: "Трата" },
    { icon: Images, label: "Фото" },
  ];
  return (
    <div className="flex items-center gap-5">
      <div className="flex flex-col items-start gap-2">
        {chips.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={reduced ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/95 py-1 pl-1.5 pr-3 shadow-md"
            >
              <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </span>
              <span className="text-xs font-medium">{c.label}</span>
            </motion.div>
          );
        })}
      </div>
      <div className="relative">
        {!reduced && (
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full bg-orange-500"
            animate={{ scale: [1, 1.45], opacity: [0.45, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <div className="relative grid size-14 place-items-center rounded-full border-2 border-white/20 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/30">
          <Plus className="size-7" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function InviteArt() {
  const emojis = ["🧭", "📷", "🧗"];
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex items-center -space-x-2.5">
        {emojis.map((e) => (
          <span
            key={e}
            className="grid size-11 place-items-center rounded-full border-2 border-background bg-secondary text-lg shadow-md ring-2 ring-primary/70"
          >
            {e}
          </span>
        ))}
        <span className="grid size-11 place-items-center rounded-full border-2 border-dashed border-primary/60 bg-background/60 text-primary">
          <UserPlus className="size-4.5" />
        </span>
      </div>
      <span className="rounded-full border border-dashed border-primary/40 bg-primary/10 px-3.5 py-1 font-mono text-xs font-bold tracking-widest text-primary">
        SUMMER26
      </span>
    </div>
  );
}

function DoneArt() {
  const reduced = useReducedMotion();
  const dots = [
    { className: "left-8 top-8 bg-orange-500", delay: 0.1 },
    { className: "right-10 top-6 bg-amber-400", delay: 0.2 },
    { className: "left-14 bottom-8 bg-violet-500", delay: 0.3 },
    { className: "right-8 bottom-10 bg-rose-500", delay: 0.15 },
  ];
  return (
    <div className="relative">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={cn("absolute size-2.5 rounded-full", d.className)}
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: d.delay, type: "spring", stiffness: 400, damping: 18 }}
        />
      ))}
      <motion.div
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/30"
      >
        <Check className="size-8" strokeWidth={3} />
      </motion.div>
    </div>
  );
}

export function TourArt({ art }: { art: TourStep["art"] }) {
  switch (art) {
    case "welcome":
      return <WelcomeArt />;
    case "tabs":
      return <TabsArt />;
    case "quickadd":
      return <QuickAddArt />;
    case "invite":
      return <InviteArt />;
    case "done":
      return <DoneArt />;
  }
}
