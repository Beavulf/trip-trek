"use client";

import { useEffect, useState } from "react";

/** Мелкая дрожь пальца не должна прятать и возвращать кнопку */
const JITTER_PX = 8;
/** У самого верха страницы кнопка всегда на месте */
const TOP_ZONE_PX = 80;
/** В конце страницы под кнопкой пусто (нижний отступ main): можно показать */
const BOTTOM_ZONE_PX = 24;

/**
 * Прятать плавающую кнопку, пока страницу листают вниз: на денежных экранах суммы стоят
 * у правого края, ровно под ней. Вверх, у верха и в конце страницы кнопка возвращается.
 */
export function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let last = window.scrollY;
    let frame = 0;

    const check = () => {
      frame = 0;
      const y = window.scrollY;
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_ZONE_PX;
      if (atEnd || y < TOP_ZONE_PX) {
        setHidden(false);
        last = y;
        return;
      }
      if (Math.abs(y - last) < JITTER_PX) return;
      setHidden(y > last);
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      setHidden(false);
    };
  }, [enabled]);

  return enabled && hidden;
}
