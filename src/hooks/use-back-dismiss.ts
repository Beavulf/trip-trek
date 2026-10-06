"use client";

import { useEffect, useRef } from "react";

import { backStack } from "@/lib/back-stack";

// «Назад» на телефоне закрывает оверлей, а не сворачивает приложение.
// Пока open, в history держится запись (src/lib/back-stack.ts); жест/кнопка
// «назад» дёргает close. Когда оверлеев нет, «назад» выходит из PWA как обычно.
export function useBackDismiss(open: boolean, close: () => void) {
  const closeRef = useRef(close);

  // close из пропсов меняется каждый рендер, а подписка живёт, пока open.
  // Эффект объявлен раньше регистрационного — к моменту регистрации ref свежий.
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open || !backStack) return;
    return backStack.push(() => closeRef.current());
  }, [open]);
}
