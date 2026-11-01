"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { BudgetMeterData } from "@/lib/budget/overview";

interface BudgetMeterProps {
  meter: Pick<BudgetMeterData, "state" | "fillPct" | "limitPct">;
  /** Высота и цвет дорожки */
  className?: string;
  /** Заливка в пределах лимита */
  fillClassName?: string;
  /** Цвет заливки из данных (цвет категории) */
  fillColor?: string;
  /** Отрезок за лимитом */
  overClassName?: string;
  /** Плавно вырасти при появлении: только у шапки, в списке движение со всех строк сразу мешает читать */
  animateIn?: boolean;
}

/**
 * Шкала «потрачено против лимита» — общая у шапки, категорий и участников.
 * При перерасходе за зазором-лимитом идёт отдельный отрезок: сразу видно, насколько вышли за рамки.
 */
export function BudgetMeter({ meter, className, fillClassName, fillColor, overClassName, animateIn = false }: BudgetMeterProps) {
  const reduce = useReducedMotion();
  const grow = animateIn && !reduce;
  const over = meter.state === "over";

  return (
    <div className={cn("relative overflow-hidden rounded-full", className)} aria-hidden="true">
      <motion.div
        initial={grow ? { width: 0 } : false}
        animate={{ width: `${over ? meter.limitPct : meter.fillPct}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={cn("absolute inset-y-0 left-0 rounded-l-full", fillClassName)}
        style={fillColor ? { background: fillColor } : undefined}
      />
      {over && (
        <motion.div
          initial={grow ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: grow ? 0.45 : 0 }}
          className={cn("absolute inset-y-0 right-0 rounded-r-full", overClassName)}
          style={{ left: `calc(${meter.limitPct}% + 3px)` }}
        />
      )}
    </div>
  );
}
