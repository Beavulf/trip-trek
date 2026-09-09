"use client";

import { useMutation } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// P1 #10: убран мёртвый invalidateQueries(["ai-summary"]) — нет useQuery с этим ключом,
// state локальный в компоненте. Сброс content по tripId делается в самом компоненте.
// `generated: boolean` — true если это реальный AI, false если локальный черновик (нет ключа).
export interface AISummaryResult {
  content: string;
  type: string;
  style: string;
  generated?: boolean;
}

export type AISummaryType = "summary" | "day" | "tips";

export interface AISummaryParams {
  type: AISummaryType;
  /** Стиль рассказа: warm | letter | cinema | humor | chronicle | tale */
  style?: string;
  /** Номер дня (для type: "day") — любой день, прошлый или будущий */
  dayNumber?: number;
}

export function useAISummary() {
  return useMutation({
    mutationFn: async ({ type, style, dayNumber }: AISummaryParams): Promise<AISummaryResult> => {
      const tripId = getTripId();
      // P0 #2: без tripId — не зовём API (кнопки disabled в UI)
      if (!tripId) {
        throw new Error("Не выбрана поездка");
      }
      const r = await fetch(`/api/ai-summary?tripId=${tripId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, style, dayNumber }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.error || `Ошибка ${r.status}`);
      }
      return body as AISummaryResult;
    },
  });
}
