"use client";

import { useCallback, useEffect, useRef } from "react";

import { clearDraft, writeDraft } from "@/lib/form-draft";

/**
 * Автосохранение черновика формы. Пишет с дебаунсом, а при сворачивании приложения,
 * закрытии вкладки и размонтировании формы — сразу и синхронно (localStorage): набранное
 * переживает случайный тап по фону шита и смахивание приложения. Пустая форма стирает
 * черновик. `discard` — после успешной отправки (отложенная запись не воскресит черновик).
 *
 * `value` лучше мемоизировать у вызывающего, `isEmpty` — стабильная функция.
 */
export function useFormDraft<T>(key: string, value: T, isEmpty: (v: T) => boolean): { discard: () => void } {
  const latest = useRef<{ value: T; empty: boolean }>({ value, empty: isEmpty(value) });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { value, empty: isEmpty(value) };
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current.empty) {
      clearDraft(key);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      writeDraft(key, latest.current.value);
    }, 400);
  }, [key, value, isEmpty]);

  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (!latest.current.empty) writeDraft(key, latest.current.value);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key]);

  const discard = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // и размонтирование формы раньше следующего эффекта не должно вернуть старый текст
    latest.current = { ...latest.current, empty: true };
    clearDraft(key);
  }, [key]);

  return { discard };
}
