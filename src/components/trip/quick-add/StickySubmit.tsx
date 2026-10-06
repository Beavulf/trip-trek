"use client";

import type { ReactNode } from "react";

/**
 * Липкий низ формы внутри MobileBottomSheet: кнопка submit всегда видна,
 * даже когда контент длиннее вьюпорта или открыта клавиатура.
 * Отрицательные поля компенсируют px-4 обёртки контента шита.
 */
export function StickySubmit({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2.5 pb-1.5 bg-card/95 backdrop-blur border-t border-border/60">
      {children}
    </div>
  );
}
