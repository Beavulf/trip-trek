"use client";

// TourHost — единственное место, которое открывает туры. Два тонких обёртки (поездка и
// «Сочтёмся») дают контекст и умеют выполнять действия кнопки «Попробовать»; общее ядро
// TourRunner решает, что показать само (pickAutoTour), принимает ручные запросы («?», Центр
// обучения, ссылка ?tour=) и превращает закрытие тура в запись прогресса (exitPatch).

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTourActions } from "@/hooks/use-tour-actions";
import { useTrip } from "@/hooks/trip/use-trip";
import { useCurrentTripId } from "@/hooks/trip/trip-id";
import { reachGoal } from "@/lib/metrika";
import {
  AUTO_COOLDOWN_MS,
  AUTO_OPEN_DELAY_MS,
  exitPatch,
  getTour,
  pickAutoTour,
  startStepFor,
  stepsFor,
  tourHref,
  type TourArea,
  type TourDef,
  type TourExit,
  type TourRole,
} from "@/lib/onboarding";
import type { StepActionKind } from "@/lib/onboarding-content";
import { useTourStore } from "@/lib/tour-store";
import { useTripStore, type TripTab } from "@/lib/trip-store";
import { LearningCenter } from "./learning-center";
import { TourDialog } from "./tour-dialog";

interface OpenTour {
  def: TourDef;
  start: number;
}

interface RunnerProps {
  area: TourArea;
  tab: TripTab;
  splitScreen: "hub" | "group" | null;
  hasTrip: boolean;
  role: TourRole | null;
  /** Роль/контекст уже известны: ручные запросы до этого ждут (иначе шаги отфильтруются по умолчанию) */
  ready: boolean;
  /** Подготовка к показу: false — тур открыт не будет (обёртка сама увела на другую страницу) */
  beforeOpen: (def: TourDef) => boolean;
  runAction: (action: StepActionKind) => void;
}

function TourRunner({ area, tab, splitScreen, hasTrip, role, ready, beforeOpen, runAction }: RunnerProps) {
  const { state, status, commit } = useOnboarding();
  const [open, setOpen] = useState<OpenTour | null>(null);
  const cooldownUntil = useRef(0);
  const requested = useTourStore((s) => s.requested);
  const clearRequest = useTourStore((s) => s.clear);
  const openTourRequest = useTourStore((s) => s.openTour);

  // Ссылка /?tour=<id> (из Профиля): превращаем в запрос и убираем параметр из адреса
  useEffect(() => {
    if (status !== "authenticated") return;
    const id = new URLSearchParams(window.location.search).get("tour");
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (getTour(id)) openTourRequest(id);
  }, [status, openTourRequest]);

  const begin = useCallback(
    (def: TourDef, manual: boolean) => {
      const steps = stepsFor(def, role);
      if (steps.length === 0) {
        if (manual) toast.info("Для вашей роли здесь нет подсказок", { description: "Зрителю доступно только чтение" });
        return;
      }
      if (!beforeOpen(def)) return;
      setOpen({ def, start: startStepFor(state, def, role) });
      reachGoal("tour_start", undefined, { tour: def.id, manual: manual ? 1 : 0 });
    },
    [role, state, beforeOpen]
  );

  // Ручной запрос: «?», Центр обучения, ссылка
  useEffect(() => {
    if (!requested || !ready || status !== "authenticated") return;
    const def = getTour(requested.id);
    clearRequest();
    // запрос из стора — внешний сигнал («?», Центр, ссылка): открыть тур надо сразу, а не на следующем рендере
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (def) begin(def, true);
  }, [requested, ready, status, begin, clearRequest]);

  // Автозапуск: что-то из непройденного, с паузой после показа экрана
  useEffect(() => {
    if (status !== "authenticated" || open || requested) return;
    const id = pickAutoTour({
      state,
      area,
      tab,
      splitScreen,
      hasTrip,
      role,
      now: Date.now(),
      cooldownUntil: cooldownUntil.current,
    });
    const def = id ? getTour(id) : undefined;
    if (!def) return;
    const timer = window.setTimeout(() => begin(def, false), AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status, open, requested, state, area, tab, splitScreen, hasTrip, role, begin]);

  const onExit = useCallback(
    (exit: TourExit) => {
      if (!open) return;
      const { def } = open;
      setOpen(null);
      cooldownUntil.current = Date.now() + AUTO_COOLDOWN_MS;
      const finished = exit.kind === "done" || exit.kind === "skip" || exit.kind === "hints-off";
      // старое поле аккаунта: «приветствие закрыто» — для статистики и откатов на прежнюю версию
      void commit(exitPatch(def, exit, new Date()), def.kind === "welcome" && finished ? { onboardingCompleted: true } : undefined);

      const goal = { done: "tour_done", skip: "tour_skip", later: "tour_later", action: "tour_action", "hints-off": "tour_off" }[exit.kind];
      reachGoal(goal, undefined, { tour: def.id, step: exit.kind === "done" ? 0 : exit.step + 1 });

      if (exit.kind === "skip") {
        toast("Тур пропущен", {
          description: "Открыть снова: кнопка «?» или Профиль → Обучение",
          action: {
            label: "Вернуть",
            onClick: () => {
              void commit({ tours: { [def.id]: null } });
              openTourRequest(def.id);
            },
          },
        });
      } else if (exit.kind === "later") {
        toast("Напомню завтра", { description: "Продолжим с этого шага. Раньше — кнопка «?» или Профиль → Обучение" });
      } else if (exit.kind === "hints-off") {
        toast("Подсказки выключены", {
          description: "Включить: Профиль → Обучение",
          action: { label: "Включить", onClick: () => void commit({ hintsOff: false }) },
        });
      }
      if ((exit.kind === "done" || exit.kind === "action") && exit.action) runAction(exit.action);
    },
    [open, commit, runAction, openTourRequest]
  );

  if (!open) return null;
  return <TourDialog def={open.def} steps={stepsFor(open.def, role)} startStep={open.start} onExit={onExit} />;
}

function roleOf(trip: { participants: { id: string; role?: string | null }[] } | undefined, userId: string | undefined): TourRole | null {
  const r = trip?.participants.find((p) => p.id === userId)?.role;
  if (!r) return null;
  return r === "owner" ? "owner" : r === "viewer" ? "viewer" : "member";
}

/** Обёртка для экрана поездки: роль и вкладка из приложения, «Попробовать» ведёт по вкладкам и формам */
export function TripTourHost() {
  const { data: session } = useAuth();
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const activeTab = useTripStore((s) => s.activeTab);
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const centerOpen = useTourStore((s) => s.centerOpen);
  const setCenterOpen = useTourStore((s) => s.setCenterOpen);
  const openTour = useTourStore((s) => s.openTour);

  const role = roleOf(trip, session?.user?.id);
  const hasTrip = !!tripId && !!trip;

  const beforeOpen = useCallback(
    (def: TourDef) => {
      if (def.kind === "tab" && def.tab) setActiveTab(def.tab);
      return true;
    },
    [setActiveTab]
  );

  const runAction = useTourActions();

  return (
    <>
      <TourRunner
        area="trip"
        tab={activeTab}
        splitScreen={null}
        hasTrip={hasTrip}
        role={role}
        ready={!tripId || !!trip}
        beforeOpen={beforeOpen}
        runAction={runAction}
      />
      <LearningCenter
        open={centerOpen}
        onOpenChange={setCenterOpen}
        onWatch={(id) => {
          setCenterOpen(false);
          openTour(id);
        }}
      />
    </>
  );
}

/** Обёртка для «Сочтёмся»: экран определяется адресом; поездочные туры отсюда ведут на главную */
export function SplitTourHost() {
  const router = useRouter();
  const pathname = usePathname();
  const splitScreen: "hub" | "group" | null =
    pathname === "/split" ? "hub" : /^\/split\/(?!add$|join$)[^/]+$/.test(pathname) ? "group" : null;

  const beforeOpen = useCallback(
    (def: TourDef) => {
      if (def.kind === "split") return true;
      router.push(tourHref(def.id));
      return false;
    },
    [router]
  );
  const runAction = useCallback(
    (action: StepActionKind) => {
      if (action === "profile-ai") router.push("/profile?ai=1");
      else if (action === "split") router.push("/split");
    },
    [router]
  );

  return (
    <TourRunner
      area="split"
      tab="dashboard"
      splitScreen={splitScreen}
      hasTrip={false}
      role={null}
      ready
      beforeOpen={beforeOpen}
      runAction={runAction}
    />
  );
}
