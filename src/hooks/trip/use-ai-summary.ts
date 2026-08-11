"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTripId } from "./trip-id";

// === AI Summary ===
export function useAISummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type }: { type: "summary" | "day" | "tips" }) => {
      const r = await fetch(`/api/ai-summary?tripId=${getTripId()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "AI request failed");
      }
      return r.json() as Promise<{ content: string; type: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-summary"] }),
  });
}
