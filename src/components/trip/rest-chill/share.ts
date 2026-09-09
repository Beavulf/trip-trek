"use client";

import { toast } from "sonner";

/**
 * Поделиться местом: нативный share-лист на мобильных, fallback — буфер обмена.
 * AbortError (юзер закрыл лист) — не ошибка.
 */
export async function shareOrCopy(text: string, url: string, title?: string): Promise<void> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: title ?? text, text, url });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Web Share может быть запрещён для этого типа контента — падаем в clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    toast("Скопировано в буфер", { description: text });
  } catch {
    toast.error("Не удалось поделиться");
  }
}

export function osmDirectionsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}`;
}
