"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Доступность модалок/шитов: при открытии переносит фокус на первый
 * контрол, зацикливает Tab внутри контейнера и возвращает фокус
 * на триггер при закрытии. Escape не перехватывает, если не передан
 * onEscape — у части диалогов своя многослойная логика Escape.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: (e: KeyboardEvent) => void,
) {
  const ref = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Фокус внутрь при открытии
    el?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.(e);
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !(current instanceof Node) || !el.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
