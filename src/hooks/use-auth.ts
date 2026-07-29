"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  emoji?: string;
  color?: string;
  plan?: string;
}

interface AuthSession {
  user: AuthUser | null;
}

// Кастомный хук для сессии (заменяет useSession из next-auth/react)
// Работает с нашим кастомным JWT в cookie
export function useAuth(): {
  data: AuthSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
} {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<AuthSession>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/auth/custom-session", { cache: "no-store" });
        if (!r.ok) return { user: null };
        const json = await r.json();
        return json as AuthSession;
      } catch {
        return { user: null };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 минут — кэш свежий
    gcTime: 30 * 60 * 1000, // 30 минут в памяти
    retry: 1, // 1 попытка повтора при ошибке
    refetchOnWindowFocus: true, // обновлять при фокусе окна
    refetchOnMount: true,
  });

  // Если ошибка — не считаем разлогиненным, показываем loading
  let status: "loading" | "authenticated" | "unauthenticated" = "loading";
  if (isLoading && !data) {
    status = "loading";
  } else if (data?.user) {
    status = "authenticated";
  } else if (data && !data.user) {
    status = "unauthenticated";
  } else if (isError) {
    // На ошибке — не редиректим, показываем loading
    status = "loading";
  }

  return { data: data || null, status };
}

// Совместимость с useSession API
export function useSessionCompat() {
  const { data, status } = useAuth();
  return { data, status };
}
