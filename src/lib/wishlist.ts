"use client";

import type { WishlistItem } from "@/components/trip/rest-chill/types";
import { getTripId } from "@/hooks/use-trip";

// P1 #5 + P1 #6: Единый helper для wishlist.
// Ключ изолирован по tripId: "triptrek-wishlist:${tripId}".
// Раньше был один общий ключ "triptrek-wishlist" → вишлист смешивался между поездками.
//
// copy честный: «только на этом телефоне» (wishlist НЕ хранится на сервере, не виден компании).
// В будущем можно мигрировать на серверный wishlist (отдельное ТЗ).

export function wishlistKey(tripId?: string): string {
  const id = tripId ?? getTripId();
  return `triptrek-wishlist:${id || "default"}`;
}

export function loadWishlist(tripId?: string): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(wishlistKey(tripId));
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWishlist(items: WishlistItem[], tripId?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(wishlistKey(tripId), JSON.stringify(items));
  } catch {
    // Quota / private mode — silent
  }
}

// Детерминированный ключ дедупликации для NearbyCard (P1 #13).
// Раньше дедуп был по имени → коллизии (разные заведения с одинаковым названием).
export function wishlistDedupeKey(item: { name: string; lat?: number; lng?: number; address?: string }): string {
  const lat = item.lat ?? 0;
  const lng = item.lng ?? 0;
  // Если есть координаты — используем lat+lng+name; иначе name+address
  if (lat && lng) return `${item.name.toLowerCase()}@${lat.toFixed(5)},${lng.toFixed(5)}`;
  return `${item.name.toLowerCase()}@${(item.address ?? "").toLowerCase()}`;
}

// Миграция старого ключа "triptrek-wishlist" → новый "triptrek-wishlist:${tripId}".
// Запускается один раз при первом обращении к новому ключу.
export function migrateLegacyWishlist(tripId?: string): WishlistItem[] | null {
  if (typeof window === "undefined") return null;
  const legacy = localStorage.getItem("triptrek-wishlist");
  if (!legacy) return null;
  try {
    const parsed = JSON.parse(legacy);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Переносим в новый ключ
      saveWishlist(parsed, tripId);
      // Старый ключ удаляем (после успешного переноса)
      localStorage.removeItem("triptrek-wishlist");
      return parsed;
    }
    localStorage.removeItem("triptrek-wishlist");
  } catch {
    localStorage.removeItem("triptrek-wishlist");
  }
  return null;
}
