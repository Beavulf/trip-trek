"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { isUpdateUnread, updatesFor, type UpdatesScope } from "@/lib/updates";
import type { UpdateEntry } from "@/lib/updates-content";

export interface UpdateItem {
  entry: UpdateEntry;
  unread: boolean;
}

/**
 * Лента обновлений для колокольчика: записи области («поездка» или «Сочтёмся») с признаком
 * «не прочитано» и отметка прочитанного. Прочитанное хранится на аккаунте (onboardingState.updatesRead),
 * поэтому на втором устройстве запись не загорится заново.
 */
export function useUpdates(scope: UpdatesScope) {
  const { data: session } = useAuth();
  const { state, commit } = useOnboarding();
  const joinedAt = session?.user?.createdAt ?? null;
  const authed = !!session?.user;

  const items = useMemo<UpdateItem[]>(
    () => (authed ? updatesFor(scope).map((entry) => ({ entry, unread: isUpdateUnread(entry, state, joinedAt) })) : []),
    [authed, scope, state, joinedAt]
  );
  const unread = items.filter((i) => i.unread).length;

  const markRead = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => items.some((i) => i.entry.id === id && i.unread));
      if (fresh.length > 0) void commit({ updatesRead: fresh });
    },
    [items, commit]
  );
  const markAllRead = useCallback(
    () => markRead(items.filter((i) => i.unread).map((i) => i.entry.id)),
    [items, markRead]
  );

  return { items, unread, markRead, markAllRead };
}
