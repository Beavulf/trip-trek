"use client";

import { useMutation } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// P1 #10: убран мёртвый invalidateQueries(["ai-summary"]) — нет useQuery с этим ключом,
// state локальный в компоненте. Сброс content по tripId делается в самом компоненте.
// Возвращаем `generated: boolean` — true если это реальный AI, false если бы был шаблон (но теперь шаблонов нет, всегда true или error).
export interface AISummaryResult {
  content: string;
  type: string;
  generated?: boolean;
}

export function useAISummary() {
  return useMutation({
    mutationFn: async ({ type }: { type: "summary" | "day" | "tips" }): Promise<AISummaryResult> => {
      const tripId = getTripId();
      // P0 #2: без tripId — не зовём API (кнопки disabled в UI)
      if (!tripId) {
        throw new Error("Не выбрана поездка");
      }
      const r = await fetch(`/api/ai-summary?tripId=${tripId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as AISummaryResult;
    },
  });
}
