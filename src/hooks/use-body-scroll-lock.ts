"use client";

import { useEffect } from "react";

// Блокирует прокрутку body когда открыт bottom sheet / modal
// Используется в Sheet, Dialog, и порталах
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPaddingRight = window.getComputedStyle(document.body).paddingRight;

    // Вычисляем ширину скроллбара чтобы не было скачка
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [active]);
}
