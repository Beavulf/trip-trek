"use client";

import { useEffect, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";

// Число, которое плавно «доезжает» до нового значения (шапка бюджета, итог в бублике):
// трата добавилась — сумма не прыгает, а считает вверх. reduced-motion — без анимации.
export function AnimatedNumber({
  value,
  format,
  duration = 0.6,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const [shown, setShown] = useState(reduce ? value : 0);
  useMotionValueEvent(mv, "change", setShown);

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, duration, mv]);

  return <>{format(shown)}</>;
}
