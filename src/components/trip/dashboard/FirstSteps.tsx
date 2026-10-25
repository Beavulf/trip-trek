"use client";

// «Первые шаги» на Обзоре: обучение делом. Пункты отмечаются сами по данным поездки
// (место, друг, трата, фото) и каждый ведёт кнопкой прямо к действию. Зрителю не показывается.

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, PartyPopper } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTourActions } from "@/hooks/use-tour-actions";
import { buildChecklist, checklistProgress, checklistVisible } from "@/lib/onboarding-checklist";
import type { TourRole } from "@/lib/onboarding-content";
import { useTourStore } from "@/lib/tour-store";
import type { TripSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FirstSteps({ trip, canInvite }: { trip: TripSummary; canInvite: boolean }) {
  const { data: session } = useAuth();
  const { state, commit, status } = useOnboarding();
  const run = useTourActions();
  const setCenterOpen = useTourStore((s) => s.setCenterOpen);
  const userId = session?.user?.id ?? "";

  const myRole = trip.participants.find((p) => p.id === userId)?.role;
  const role: TourRole | null = !myRole ? null : myRole === "owner" ? "owner" : myRole === "viewer" ? "viewer" : "member";
  const visible = status === "authenticated" && checklistVisible(role, state.checklistHidden);

  // Ключ ИИ — из профиля (в нём только маска, сам ключ наружу не отдаётся)
  const { data: profile } = useQuery<{ aiKeyTail?: string | null }>({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const r = await fetch("/api/user");
      if (!r.ok) throw new Error("fetch profile");
      return r.json();
    },
    enabled: visible && !!userId,
    staleTime: 60_000,
  });

  if (!visible) return null;

  const items = buildChecklist({
    role,
    totalPlaces: trip.totalPlaces,
    participants: trip.participants.length,
    totalSpent: trip.totalSpent,
    totalPhotos: trip.totalPhotos,
    canInvite,
    hasAiKey: profile ? !!profile.aiKeyTail : null,
  });
  const { done, total, complete } = checklistProgress(items);

  return (
    <section aria-label="Первые шаги" className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{complete ? "Основы освоены" : "Первые шаги"}</h2>
          <p className="text-xs text-muted-foreground">
            {complete ? "Теперь поездка работает на вас." : "Сделайте по кнопке — пункты отметятся сами."}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
          {done} из {total}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <ul className="mt-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/30"
              )}
              aria-hidden
            >
              {it.done && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-sm font-medium", it.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                {it.title}
                {it.optional && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">по желанию</span>}
              </div>
              {!it.done && <div className="text-xs text-muted-foreground">{it.hint}</div>}
            </div>
            {!it.done && it.action && (
              <button
                type="button"
                onClick={() => run(it.action!)}
                aria-label={`${it.title}: перейти`}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform active:scale-90"
              >
                <ArrowRight className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
        <button
          type="button"
          onClick={() => setCenterOpen(true)}
          className="min-h-9 rounded-lg px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Все обучения
        </button>
        <button
          type="button"
          onClick={() => void commit({ checklistHidden: true })}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
            complete ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {complete && <PartyPopper className="size-3.5" aria-hidden />}
          {complete ? "Готово" : "Скрыть список"}
        </button>
      </div>
    </section>
  );
}
