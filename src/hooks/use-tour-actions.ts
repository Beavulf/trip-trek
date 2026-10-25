"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { StepActionKind } from "@/lib/onboarding-content";
import { useTripStore, type TripTab } from "@/lib/trip-store";

/**
 * Исполнитель действий обучения («Попробовать: …», кнопки пунктов «Первых шагов»):
 * вкладка, форма быстрого добавления, приглашение друзей, ключ ИИ в профиле, «Сочтёмся».
 */
export function useTourActions() {
  const router = useRouter();
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const openQuickAdd = useTripStore((s) => s.openQuickAdd);
  return useCallback(
    (action: StepActionKind) => {
      if (action.startsWith("tab:")) setActiveTab(action.slice(4) as TripTab);
      else if (action === "quickadd:photo") openQuickAdd("photo");
      else if (action === "quickadd:expense") openQuickAdd("expense");
      else if (action === "quickadd:journal") openQuickAdd("journal");
      else if (action === "invite") window.dispatchEvent(new CustomEvent("triptrek-open-invite"));
      else if (action === "profile-ai") router.push("/profile?ai=1");
      else if (action === "split") router.push("/split");
    },
    [setActiveTab, openQuickAdd, router]
  );
}
