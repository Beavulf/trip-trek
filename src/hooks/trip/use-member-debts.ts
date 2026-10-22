"use client";

import { useQuery } from "@tanstack/react-query";

export interface MemberDebt {
  /** owes — участник должен otherName; owed — otherName должен участнику */
  direction: "owes" | "owed";
  otherId: string;
  otherName: string;
  amount: number;
}

// Незакрытые долги участника — для предупреждения в диалогах «выйти / исключить / заблокировать».
// userId пуст = долги самого запрашивающего. enabled — только пока диалог открыт.
export function useMemberDebts(tripId: string | null | undefined, userId: string | null, enabled: boolean) {
  return useQuery<MemberDebt[]>({
    queryKey: ["member-debts", tripId, userId],
    enabled: enabled && !!tripId,
    staleTime: 0,
    queryFn: async () => {
      const qs = new URLSearchParams({ tripId: tripId! });
      if (userId) qs.set("userId", userId);
      const r = await fetch(`/api/participants/debts?${qs}`);
      if (!r.ok) throw new Error("fetch debts failed");
      const json = await r.json();
      return Array.isArray(json?.debts) ? json.debts : [];
    },
  });
}
