"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Состояние публичной страницы (/p/<token>) — единственный источник данных
// и для карточки в «О поездке», и для шита «Поделиться» из «Маршрута».
// GET пускает участников кроме зрителей (ссылку копируют все, кто участвовал),
// мутации — только владельца (requireTripOwner в API).

export interface PublicShareState {
  enabled: boolean;
  token: string | null;
  allowDownload: boolean;
  /** До какого момента ссылка действует (ISO); null — бессрочно */
  expiresAt: string | null;
  /** Срок уже вышел: гости видят «срок действия закончился» */
  expired: boolean;
}

export type PublicSharePatch = {
  enabled?: boolean;
  rotate?: boolean;
  allowDownload?: boolean;
  /** Продлить/установить срок: суток от сейчас (1, 7, 30, 90); null — сделать бессрочной */
  expiresInDays?: number | null;
};

export function publicShareUrl(token: string | null | undefined): string {
  if (!token || typeof window === "undefined") return "";
  return `${window.location.origin}/p/${token}`;
}

function normalize(d: Partial<PublicShareState> | null): PublicShareState {
  return {
    enabled: !!d?.enabled,
    token: d?.token ?? null,
    allowDownload: d?.allowDownload !== false,
    expiresAt: d?.expiresAt ?? null,
    expired: !!d?.expired,
  };
}

export function usePublicShare(tripId: string) {
  const qc = useQueryClient();

  const query = useQuery<PublicShareState>({
    queryKey: ["trip-share", tripId],
    queryFn: async () => {
      const r = await fetch(`/api/trip/share?tripId=${encodeURIComponent(tripId)}`);
      if (!r.ok) throw new Error("fetch share state failed");
      return normalize(await r.json());
    },
    enabled: !!tripId,
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: async (patch: PublicSharePatch) => {
      const r = await fetch("/api/trip/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, ...patch }),
      });
      if (!r.ok) throw new Error("update share failed");
      return normalize(await r.json());
    },
    onSuccess: (state) => qc.setQueryData(["trip-share", tripId], state),
  });

  return {
    state: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    url: publicShareUrl(query.data?.token),
    update: update.mutate,
    updating: update.isPending,
  };
}
