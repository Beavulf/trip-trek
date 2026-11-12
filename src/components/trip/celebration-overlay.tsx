"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { haptic } from "@/lib/utils";

export interface CelebrationItem {
  id?: string;
  emoji: string;
  title: string;
  note?: string;
}

export interface CelebrationAction {
  label: string;
  onClick: () => void;
}

interface CelebrationOverlayProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Главный эмодзи карточки */
  emoji: string;
  title: string;
  subtitle?: string;
  /** Строки-бейджи под заголовком (награды и т.п.) */
  items?: CelebrationItem[];
  actions?: CelebrationAction[];
  /** Компакт: без фейерверка, мельче — для делового «Сочтёмся» */
  compact?: boolean;
}

// Фейерверк без библиотек: эмодзи путешествий + кружки палитры приложения
// (терракота/золото/роза — как градиенты Обзора и наград).
const BURST_EMOJI = ["✈️", "🎉", "📸", "⛰️", "🍜", "🧭"];
const BURST_COLORS = ["#f97316", "#f59e0b", "#f43f5e", "#10b981", "#06b6d4"];

interface Particle {
  emoji?: string;
  color?: string;
  /** полярный разлёт из центра экрана */
  angle: number;
  dist: number;
  delay: number;
  size: number;
  dur: number;
  spin: number;
}

function makeParticles(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const isEmoji = i % 2 === 0;
    out.push({
      emoji: isEmoji ? BURST_EMOJI[Math.floor((i / 2) % BURST_EMOJI.length)] : undefined,
      color: isEmoji ? undefined : BURST_COLORS[i % BURST_COLORS.length],
      angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
      dist: 120 + Math.random() * 140,
      delay: Math.random() * 0.35,
      size: isEmoji ? 16 + Math.random() * 14 : 6 + Math.random() * 6,
      dur: 1.6 + Math.random() * 0.9,
      spin: Math.random() * 240 - 120,
    });
  }
  return out;
}

export function CelebrationOverlay({
  open,
  onOpenChange,
  emoji,
  title,
  subtitle,
  items,
  actions,
  compact,
}: CelebrationOverlayProps) {
  const reduce = useReducedMotion();
  // «назад» на телефоне закрывает праздник, а не сворачивает PWA (правило репо)
  useBackDismiss(open, () => onOpenChange(false));

  // Хаптика — только на реальном открытии; паттерн как у разблокировки наград
  useEffect(() => {
    if (open) haptic([30, 40, 30]);
  }, [open]);

  // Автозакрытие — только когда нет действий: с ними пусть пользователь решает сам
  const hasActions = !!actions && actions.length > 0;
  useEffect(() => {
    if (!open || hasActions) return;
    const t = setTimeout(() => onOpenChange(false), 5000);
    return () => clearTimeout(t);
  }, [open, hasActions, onOpenChange]);

  // Частицы пересобираем на каждый показ — разлёт каждый раз другой;
  // reduced-motion и compact — без фейерверка вовсе
  const particles = useMemo(
    () => (open && !compact && !reduce ? makeParticles(26) : []),
    [open, compact, reduce]
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="celebration-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
        >
          {/* Фейерверк: частицы разлетаются из-за карточки и гаснут */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {particles.map((p, i) => (
              <motion.span
                key={i}
                className={p.emoji ? "absolute left-1/2 top-1/2" : "absolute left-1/2 top-1/2 rounded-full"}
                style={p.emoji ? { fontSize: p.size } : { width: p.size, height: p.size, background: p.color }}
                initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                animate={{
                  x: Math.cos(p.angle) * p.dist,
                  y: Math.sin(p.angle) * p.dist + 40, // лёгкая «гравитация» вниз
                  opacity: [0, 1, 1, 0],
                  rotate: p.spin,
                }}
                transition={{ duration: p.dur, delay: p.delay, ease: "easeOut", times: [0, 0.15, 0.6, 1] }}
              >
                {p.emoji}
              </motion.span>
            ))}
          </div>

          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className={
              compact
                ? "relative w-full max-w-xs rounded-3xl border border-border bg-card p-5 text-center shadow-2xl"
                : "relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
            }
          >
            <motion.div
              className={compact ? "text-5xl" : "text-6xl"}
              initial={reduce ? undefined : { scale: 0, rotate: -20 }}
              animate={reduce ? undefined : { scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
              aria-hidden
            >
              {emoji}
            </motion.div>
            <h2 className="mt-2 text-lg font-bold leading-snug">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            {items && items.length > 0 && (
              <ul className="mt-3 space-y-2 text-left">
                {items.map((it, i) => (
                  <li
                    key={it.id ?? `${i}-${it.title}`}
                    className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <span className="text-xl leading-none" aria-hidden>{it.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">{it.title}</span>
                      {it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  {a.label}
                </button>
              ))}
              {/* «Понятно» рисует сам примитив только когда consumer не передал свои действия — иначе кнопка закрытия дублируется */}
              {!hasActions && (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-input px-4 text-sm font-medium text-muted-foreground transition-transform hover:text-foreground active:scale-[0.98]"
                >
                  Понятно
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
