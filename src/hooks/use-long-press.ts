"use client";

import { useCallback, useRef } from "react";

/** Долгое нажатие (~500мс) для входа в мультивыбор: таймер на pointerdown,
    любая отмена (отпускание, уход курсора, скролл) его гасит. Если таймер
    сработал — последующий click надо пропустить (firedRef). */
export function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    firedRef.current = false;
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      firedRef.current = true;
      onLongPress();
    }, 500);
  }, [enabled, onLongPress, clear]);

  return { onPointerDown, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, firedRef };
}
