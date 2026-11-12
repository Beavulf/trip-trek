"use client";
// Pull-to-refresh: пальцем от верхнего края тянем данные к себе.
// Только coarse-pointer; только при scrollY===0; пока открыт шит (scroll-lock
// на body) жест не наш; горизонтальная доминанта на старте — это chip-rail,
// не мы; если под пальцем внутренний скроллер (чат-док, список) ещё прокручен
// или элемент живёт своей жестовой жизнью (touch-action: none — карта Leaflet),
// тоже не мы. Машина — чистая (lib/pull-refresh), хук только про события и
// вызов onRefresh.
//
// Про passive: touchmove вешается всегда НЕ-passive — preventDefault разрешён
// только так, иначе Chrome проскроллит мимо нас. Переключать passive на лету
// нельзя, поэтому гасим нативный скролл точечно: preventDefault только когда
// жест наш и дистанция > 0, обычный скролл не страдает.
//
// scroll-behavior: smooth (globals.css) тут не мешает: scrollTop мы никогда
// не сбрасываем — preventDefault держит окно на месте весь жест, окно и так
// остаётся в top.

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/utils";
import { pullDistance, pullOnMove, pullOnRelease, type PullPhase } from "@/lib/pull-refresh";

/**
 * Решаем, отдан ли жест внутреннему скроллу.
 * true = под пальцем есть вертикальный скроллер не у верха (его скролл важнее
 * нашего PTR) или элемент с touch-action: none (карта, свой жест-обработчик).
 */
function gestureBelongsToInnerScroll(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  let el = target.parentElement;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    if (style.touchAction === "none") return true;
    const scrollableY = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
    if (scrollableY && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function usePullToRefresh(onRefresh: () => Promise<void> | void): {
  phase: PullPhase;
  distance: number;
} {
  const [coarse, setCoarse] = useState(false);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const [distance, setDistance] = useState(0);

  // Жестовая бухгалтерия живёт в ref'ах: хендлеры не должны зависеть от
  // устаревших замыканий, а перерисовка на каждый пиксель нужна только пилле
  const phaseRef = useRef<PullPhase>("idle");
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const claimed = useRef(false); // жест признан нашим — тянем до touchend
  const denied = useRef(false); // жест отдан (горизонталь/внутренний скролл)
  const busy = useRef(false); // onRefresh уже в полёте — не перезапускаем

  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  // Гейт на тач-устройства: подписка на change, чтобы режим эмуляции
  // в DevTools и гибридные устройства подхватывались без перезагрузки
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!coarse) return;

    const resetGesture = () => {
      startY.current = null;
      claimed.current = false;
      denied.current = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // Второй палец — пинч, не наш
        resetGesture();
        denied.current = true;
        return;
      }
      // scrollY > 0 или открыт шит (scroll-lock на body) — жест не наш вовсе
      if (window.scrollY > 0 || document.body.style.overflow === "hidden") {
        resetGesture();
        denied.current = true;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      claimed.current = false;
      denied.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || denied.current) return;
      const t = e.touches[0];
      const dy = t.clientY - startY.current;
      const dx = t.clientX - startX.current;
      if (!claimed.current) {
        // Первые пиксели жеста решают судьбу: горизонтальная доминанта —
        // это chip-rail или свайп, вертикаль вверх — обычный скролл
        if (Math.abs(dx) > Math.abs(dy)) {
          denied.current = true;
          return;
        }
        if (dy <= 0) return;
        if (gestureBelongsToInnerScroll(e.target)) {
          denied.current = true;
          return;
        }
        claimed.current = true;
      }
      const d = pullDistance(Math.max(0, dy));
      const res = pullOnMove(phaseRef.current, d);
      phaseRef.current = res.phase;
      setPhase(res.phase);
      if (res.tick) haptic(15); // тик пересечения порога — один на пересечение
      setDistance(d);
      if (d > 0) e.preventDefault(); // тянем — нативному скроллу говорим «нет»
    };

    const onTouchEnd = () => {
      if (startY.current === null) return;
      const next = pullOnRelease(phaseRef.current);
      resetGesture();
      phaseRef.current = next;
      setPhase(next);
      setDistance(0);
      if (next !== "refreshing" || busy.current) return;
      busy.current = true;
      void Promise.resolve(refreshRef.current()).finally(() => {
        busy.current = false;
        phaseRef.current = "idle";
        setPhase("idle");
        setDistance(0);
        haptic(8); // короткий тик «готово»
      });
    };

    // touchcancel (система забрала жест, входящий звонок, пинч) — откат в idle
    // без обновления: пользователь ничего не «отпускал»
    const onTouchCancel = () => {
      if (phaseRef.current === "refreshing") return; // обновление живёт своей жизнью
      resetGesture();
      phaseRef.current = "idle";
      setPhase("idle");
      setDistance(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [coarse]);

  return { phase, distance };
}
