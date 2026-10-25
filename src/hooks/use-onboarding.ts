"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  EMPTY_ONBOARDING_STATE,
  applyPatch,
  clearLegacyLocalState,
  mergeStates,
  readLegacyLocalState,
  readLocalState,
  sanitizeState,
  writeLocalState,
  type OnboardingPatch,
  type OnboardingState,
} from "@/lib/onboarding-state";
import { useAuth } from "./use-auth";

type SessionCache = { user: Record<string, unknown> | null } | undefined;

/**
 * Единая точка состояния обучения на клиенте. Источник правды — аккаунт
 * (User.onboardingState через /api/auth/custom-session); локальная копия устройства
 * только страхует запись, которая ещё не дошла до сервера. Любое изменение:
 * применяется оптимистично (кэш сессии + localStorage) и уходит на сервер патчем
 * PATCH /api/user { onboardingState }.
 *
 * Старые отметки (onboardingCompletedAt и список «показанных вкладок» в localStorage)
 * читаются как записи туров, поэтому после обновления никто не получает обучение заново.
 */
export function useOnboarding() {
  const { data: session, status } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;
  const user = session?.user ?? null;

  const state = useMemo<OnboardingState>(() => {
    if (!user) return EMPTY_ONBOARDING_STATE;
    let s = sanitizeState(user.onboardingState);
    const local = readLocalState(user.id);
    if (local) s = mergeStates(s, local);
    const legacy = readLegacyLocalState(user.id);
    if (legacy) s = mergeStates(s, legacy);
    // Аккаунты, прошедшие старый тур: onboardingCompletedAt заменяет запись welcome
    if (user.onboardingCompletedAt && !s.tours.welcome) {
      const at = new Date(user.onboardingCompletedAt);
      if (!s.resetAt || at >= new Date(s.resetAt)) {
        s = { ...s, tours: { ...s.tours, welcome: { status: "done", step: 0, at: at.toISOString() } } };
      }
    }
    return s;
    // user меняется при каждом обновлении кэша сессии — этого достаточно для перечитывания localStorage
  }, [user]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  /** Применить патч: оптимистично у себя и на сервере. extra — поля профиля, идущие в том же запросе */
  const commit = useCallback(
    async (patch: OnboardingPatch, extra?: { onboardingCompleted?: boolean }): Promise<boolean> => {
      if (!userId) return false;
      const next = applyPatch(stateRef.current, patch, new Date());
      stateRef.current = next;
      writeLocalState(userId, next);
      if (patch.reset) clearLegacyLocalState(userId);
      qc.setQueryData<SessionCache>(["auth-session"], (old) => {
        if (!old?.user) return old;
        const completedAt =
          extra?.onboardingCompleted === undefined
            ? old.user.onboardingCompletedAt
            : extra.onboardingCompleted
              ? new Date().toISOString()
              : null;
        return { ...old, user: { ...old.user, onboardingState: next, onboardingCompletedAt: completedAt } };
      });
      try {
        const r = await fetch("/api/user", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingState: patch, ...extra }),
        });
        return r.ok;
      } catch {
        // нет связи — запись осталась на устройстве и уедет на сервер при следующем заходе (см. ниже)
        return false;
      }
    },
    [userId, qc]
  );

  // Дозалив: то, что есть на устройстве, а на аккаунте нет (обрыв, старые отметки) — одним патчем
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || status !== "authenticated" || !user) return;
    syncedRef.current = true;
    const account = sanitizeState(user.onboardingState);
    const tours: NonNullable<OnboardingPatch["tours"]> = {};
    for (const [id, p] of Object.entries(state.tours)) {
      const have = account.tours[id];
      if (!have || Date.parse(p.at) > Date.parse(have.at)) tours[id] = p;
    }
    // старый onboardingCompletedAt и так на аккаунте — не дублируем welcome
    if (user.onboardingCompletedAt) delete tours.welcome;
    if (Object.keys(tours).length === 0) {
      clearLegacyLocalState(user.id);
      return;
    }
    void commit({ tours }).then((ok) => {
      if (ok) clearLegacyLocalState(user.id);
    });
  }, [status, user, state, commit]);

  /** «Сбросить всё»: все туры, пауза и скрытый чек-лист с нуля; welcome откроется снова */
  const resetAll = useCallback(() => commit({ reset: true }, { onboardingCompleted: false }), [commit]);

  return { userId, status, state, commit, resetAll };
}
