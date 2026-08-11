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
      return r.json();
    },
    staleTime: 60 * 60 * 1000, // 1 час
  });
}
