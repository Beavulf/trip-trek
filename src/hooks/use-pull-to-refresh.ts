"use client";
// Pull-to-refresh: пальцем от верхнего края тянем данные к себе.
// Только coarse-pointer; только при scrollY===0; пока открыт шит (scroll-lock
// на body) жест не наш; горизонтальная доминанта на старте — это chip-rail,
// не мы; если под пальцем внутренний скроллер (чат-док, список) ещё прокручен
// или элемент живёт своей жестовой жизнью (touch-action: none — карта Leaflet),
// тоже не мы. Машина — чистая (lib/pull-refresh), хук только про события и
// вызов onRefresh.
//
// Про passive: preventDefault допустим только из НЕ-passive touchmove, иначе
// Chrome проскроллит мимо нас. Но постоянный НЕ-passive touchmove на window
// душил бы компоузиторный скролл на каждом жесте страницы (Android Chrome).
// Поэтому слушатели живут ровно один жест: постоянным остаётся только passive
// touchstart — когда гейты пропустили жест, к нему на лету цепляются
// НЕ-passive touchmove и touchend/touchcancel/resize, а на end/cancel/отказе
// снимаются. Слушатель, добавленный внутри обработки touchstart, получает все
// последующие move этого жеста. Инвариант: между жестами на window нет ни
// одного НЕ-passive touchmove. preventDefault — точечно: только когда жест
// наш и дистанция > 0.
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

    // Снять per-жестовые слушатели. Idempotent — любой путь завершения жеста
    // может звать не задумываясь. (Ссылки на хендлеры валидны в момент вызова:
    // все они объявлены ниже и снимаются только после того, как успели
    // повеситься в onTouchStart.)
    const detachGesture = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("resize", onResize);
    };

    // Жест отдан нативному скроллу/свайпу (решение в первых пикселях move).
    // До claim'а preventDefault ни разу не звали — нативе ничего не должны,
    // снимаем слушатели и жест живёт дальше без нас
    const denyGesture = () => {
      resetGesture();
      denied.current = true;
      detachGesture();
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
          denyGesture();
          return;
        }
        if (dy <= 0) return;
        if (gestureBelongsToInnerScroll(e.target)) {
          denyGesture();
          return;
        }
        claimed.current = true;
      }
      const d = pullDistance(Math.max(0, dy));
      const res = pullOnMove(phaseRef.current, d);
      phaseRef.current = res.phase;
      setPhase(res.phase);
      if (res.tick) haptic(15); // тик пересечения порога — один на пересечение
      // refreshing: дистанцию не обновляем (остаётся 0), иначе прижатый
      // палец «шатает» пиллу со спиннером; машине не трогаем — она и так
      // в refreshing ничего не меняет
      if (phaseRef.current !== "refreshing") setDistance(d);
      if (d > 0) e.preventDefault(); // тянем — нативному скроллу говорим «нет»
    };

    const onTouchEnd = () => {
      if (startY.current === null) return;
      const next = pullOnRelease(phaseRef.current);
      resetGesture();
      detachGesture();
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

    // Откат жеста без обновления — touchcancel (система забрала жест:
    // входящий звонок, пинч) и resize (поворот экрана посреди pull'а —
    // startY больше не сопоставим с пальцем). Обновление в полёте не трогаем:
    // оно живёт своим циклом и погасится в .finally
    const abortGesture = () => {
      const refreshing = phaseRef.current === "refreshing";
      resetGesture();
      detachGesture();
      if (refreshing) return;
      phaseRef.current = "idle";
      setPhase("idle");
      setDistance(0);
    };

    const onTouchCancel = abortGesture;
    const onResize = abortGesture;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // Второй палец — пинч, не наш; если он пришёл посреди нашего pull'а —
        // это откат как touchcancel (abortGesture снимет per-жестовые слушатели)
        abortGesture();
        denied.current = true;
        return;
      }
      // scrollY > 0 или открыт шит (scroll-lock на body) — жест не наш вовсе
      if (window.scrollY > 0 || document.body.style.overflow === "hidden") {
        abortGesture();
        denied.current = true;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      claimed.current = false;
      denied.current = false;
      // Per-жестовое цепление: НЕ-passive touchmove живёт только пока жест
      // наш — постоянный listener отключил бы компоузиторный скролл всей
      // странице между жестами
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("touchcancel", onTouchCancel, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      detachGesture(); // размонтирование посреди жеста — снять per-жестовые
    };
  }, [coarse]);

  return { phase, distance };
}
