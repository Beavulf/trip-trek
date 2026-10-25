"use client";

// Крупные иллюстрации для вступления и финала тура. Остальные шаги рисуют мини-макеты
// (mock-scene.tsx): они показывают настоящий язык интерфейса, а не абстрактную плитку.

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourStepDef } from "@/lib/onboarding-content";
import { MockStage } from "./mock-scene";

function WelcomeArt() {
  const reduced = useReducedMotion();
  return (
    <div className="relative flex size-full items-center justify-center">
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

function DoneArt() {
  const reduced = useReducedMotion();
  const dots = [
    { className: "left-[18%] top-[22%] bg-orange-500", delay: 0.1 },
    { className: "right-[20%] top-[16%] bg-amber-400", delay: 0.2 },
    { className: "left-[26%] bottom-[20%] bg-violet-500", delay: 0.3 },
    { className: "right-[18%] bottom-[24%] bg-rose-500", delay: 0.15 },
  ];
  return (
    <div className="relative size-full">
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
      <div className="absolute inset-0 grid place-items-center">
        <motion.div
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
          className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/30"
        >
          <Check className="size-8" strokeWidth={3} />
        </motion.div>
      </div>
    </div>
  );
}

/** Иллюстрация шага: крупная картинка (art) или анимированный макет интерфейса (scene) */
export function StepArt({ step }: { step: TourStepDef }) {
  if (step.art === "welcome") return <WelcomeArt />;
  if (step.art === "done") return <DoneArt />;
  if (step.scene) return <MockStage scene={step.scene} />;
  return null;
}
