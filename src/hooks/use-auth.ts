"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
// Работает с нашим кастомным JWT
export function useAuth(): {
  data: AuthSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
} {
  const { data, isLoading } = useQuery<AuthSession>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const r = await fetch("/api/auth/custom-session");
      if (!r.ok) return { user: null };
      return r.json();
    },
    staleTime: 60 * 1000, // 1 минута
    retry: false,
  });

  const status = isLoading ? "loading" : data?.user ? "authenticated" : "unauthenticated";
  return { data: data || null, status };
}

// Совместимость с useSession API
export function useSessionCompat() {
  const { data, status } = useAuth();
  return { data, status };
}
