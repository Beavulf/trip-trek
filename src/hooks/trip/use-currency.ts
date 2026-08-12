"use client";

import { useQuery } from "@tanstack/react-query";

// === Currency ===
export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  updated: string | null;
  fallback?: boolean;
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
