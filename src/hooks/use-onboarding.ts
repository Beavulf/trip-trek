"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  clearSeenHints,
  readLocalTourDone,
  readSeenHints,
  writeLocalTourDone,
} from "@/lib/onboarding";
import { useAuth } from "./use-auth";

/**
 * Единая точка состояния обучения для клиента: статус с аккаунта
 * (User.onboardingCompletedAt через /api/auth/custom-session) + локальная тень
 * устройства. PATCH /api/user { onboardingCompleted } — единственная мутация;
 * после неё инвалидируем auth-session, чтобы флаг приехал на все подписчики.
 *
 * Локальные отметки читаются лениво при первом рендере: все потребители хука
 * маунтятся только при готовой сессии (page.tsx и /profile держат спиннер до
 * авторизации), так что userId уже известен и «заглушки» не возникает — важно,
 * потому что заглушка localDone=true выглядела бы как «тур уже закрыли».
 */
export function useOnboarding() {
  const { data: session, status } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;
  const completed = session?.user ? session.user.onboardingCompletedAt != null : false;

  const [localDone] = useState(() => readLocalTourDone(userId));
  const [seenHints, setSeenHints] = useState<string[] | null>(() => readSeenHints(userId));

  /**
   * Отметить обучение пройденным (true) или сбросить (false, «Пройти заново»).
   * Локальную тень пишем оптимистично: тур не должен вернуться из-за обрыва сети.
   */
  const setOnboardingCompleted = useCallback(
    async (value: boolean) => {
      if (userId) {
        writeLocalTourDone(userId, value);
        if (!value) clearSeenHints(userId);
      }
      if (!value) setSeenHints([]);
      try {
        const r = await fetch("/api/user", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingCompleted: value }),
        });
        if (r.ok) {
          await qc.invalidateQueries({ queryKey: ["auth-session"] });
          return true;
        }
      } catch {
        // сеть/сервер недоступны — на аккаунте отметится при следующем удачном входе
      }
      return false;
    },
    [userId, qc]
  );

  return { userId, status, completed, localDone, seenHints, setOnboardingCompleted };
}
