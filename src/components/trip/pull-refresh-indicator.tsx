"use client";
// Пилюля pull-to-refresh: живёт под sticky-шапкой (высоту шапки меряет app-shell
// в --header-h), z-40 как у шапки — поверх контента, но не полноэкранная.
// Показывается только в фазах pulling/armed/refreshing; в pulling/armed тянется
// за пальцем на половину дистанции, в refreshing прижата под шапкой со спиннером.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PULL_THRESHOLD, type PullPhase } from "@/lib/pull-refresh";

const LABELS: Record<Exclude<PullPhase, "idle">, string> = {
  pulling: "Потяни вниз…",
  armed: "Отпусти, чтобы обновить",
  refreshing: "Обновляем…",
};

export function PullRefreshIndicator({ phase, distance }: { phase: PullPhase; distance: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
          style={{ top: "calc(var(--header-h, 6.5rem) + 0.25rem)" }}
        >
          <motion.div
            role="status"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              // Половина пути за пальцем: живо, но не уезжает через пол-экрана;
              // при reduced motion пилюля стоит под шапкой и только проявляется
              y: reduceMotion ? 0 : Math.min(distance, PULL_THRESHOLD) / 2,
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={
              reduceMotion
                ? { duration: 0.15, ease: "easeOut" }
                : { type: "spring", stiffness: 420, damping: 32 }
            }
            className="flex items-center gap-1.5 rounded-full bg-card/90 backdrop-blur border border-border shadow-lg px-3.5 py-2 text-xs font-medium"
          >
            {phase === "refreshing" ? (
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
            ) : (
              <ArrowDown
                className={cn("size-3.5", phase === "armed" ? "text-primary" : "opacity-60")}
                aria-hidden
              />
            )}
            <span>{LABELS[phase]}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
