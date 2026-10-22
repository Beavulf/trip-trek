"use client";

import { useQuery } from "@tanstack/react-query";
import { BASE_CURRENCY } from "@/lib/currencies";

// === Currency ===
export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  updated: string | null;
  fallback?: boolean;
  /** Коды валют, чей курс взят из статичной (устаревшей) таблицы, а не из живого API */
  approxCodes?: string[];
}

export function useCurrency() {
  return useQuery<CurrencyRates>({
    queryKey: ["currency"],
    queryFn: async () => {
      const r = await fetch("/api/currency");
      if (!r.ok) throw new Error("fetch currency failed");
      const data = await r.json();
      if (!data?.rates || typeof data.rates !== "object") {
        throw new Error("invalid currency payload");
      }
      return data as CurrencyRates;
    },
    staleTime: 60 * 60 * 1000, // 1 час
  });
}

export interface RateInfo {
  /** Курсы «единиц валюты за 1 USD» (undefined, пока не загрузились) */
  rates: Record<string, number> | undefined;
  /** Курс для кода есть (или это USD) — сумму можно пересчитать и отправить */
  ready: boolean;
  /** Курс взят из статичной таблицы — показываем «приблизительный» */
  approx: boolean;
  loading: boolean;
  /** Курсов нет и не будет без повтора (запрос упал или кода нет в ответе) */
  failed: boolean;
  refetch: () => void;
}

// Состояние курса валюты ввода для форм трат: пересчёт в USD без курса запрещён (см. lib/budget/convert.ts)
export function useRateFor(code: string): RateInfo {
  const q = useCurrency();
  const rates = q.data?.rates;
  const isBase = code === BASE_CURRENCY;
  const rate = rates?.[code];
  const ready = isBase || (typeof rate === "number" && rate > 0);
  return {
    rates,
    ready,
    approx: !isBase && ready && (q.data?.fallback === true || q.data?.approxCodes?.includes(code) === true),
    loading: !isBase && !ready && q.isLoading,
    failed: !isBase && !ready && !q.isLoading,
    refetch: () => void q.refetch(),
  };
}
