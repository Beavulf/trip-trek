"use client";

import { WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChecklist, useCurrentTripId, useInfo, useTrip } from "@/hooks/use-trip";
import { useIsOnline } from "@/hooks/use-is-online";
import { useTodayKey } from "@/hooks/use-today-key";
import { checklistProgress, defaultInfoView, type InfoView } from "@/lib/info-page";
import { useTripStore } from "@/lib/trip-store";
import { tripRangeKeys } from "@/lib/trip-days";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChecklistSection } from "./ChecklistSection";
import { ReferenceSection } from "./ReferenceSection";

/**
 * Вкладка «Инфо». Вместо ленты на пять экранов — два раздела под два разных вопроса:
 * «Чек-лист» (что сделать и взять с собой) и «Справка» (что пригодится в дороге).
 * Раздел открывается по фазе поездки; настройки уведомлений и бэкап отсюда ушли в профиль
 * и «О поездке»: к подготовке они отношения не имеют.
 */
export function InfoPanel() {
  const tripId = useCurrentTripId();
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const { data: session } = useAuth();
  const { data: checklist } = useChecklist();
  const { data: reference } = useInfo();
  const { infoView, setInfoView, setTripSwitcherOpen } = useTripStore();
  const today = useTodayKey();
  const online = useIsOnline();

  if (!tripId) {
    return (
      <div className="py-16 text-center space-y-2 animate-fade-up">
        <div className="text-4xl" aria-hidden="true">📋</div>
        <h1 className="text-lg font-semibold">Нет активной поездки</h1>
        <p className="text-sm text-muted-foreground">Выбери поездку, чтобы вести чек-лист и справку</p>
        <button
          type="button"
          onClick={() => setTripSwitcherOpen(true)}
          className="mt-2 min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground active:scale-95"
        >
          Мои поездки
        </button>
      </div>
    );
  }

  // Без сети поездка не загрузится, но копия чек-листа и справки есть: ошибка только если показать нечего
  const nothingToShow = !trip && !checklist?.length && !reference?.length;
  if (tripError && nothingToShow) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl" aria-hidden="true">🤔</div>
        <p className="text-sm font-medium">{online ? "Не удалось загрузить поездку" : "Нет сети, а копии на этом устройстве ещё нет"}</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 min-h-11 rounded-lg bg-primary px-3 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  const range = trip ? tripRangeKeys(trip.settings) : null;
  const view = infoView ?? defaultInfoView(range?.startKey ?? null, today);
  const myId = session?.user?.id;
  // Зритель читает, но не правит (API режет мутации), а без сети правки всё равно не уйдут на сервер
  const canEdit = !!trip && trip.participants.find((p) => p.id === myId)?.role !== "viewer";
  const progress = checklistProgress(checklist ?? []);

  const views: { key: InfoView; label: string; count: string | null }[] = [
    { key: "checklist", label: "Чек-лист", count: progress.total ? `${progress.done}/${progress.total}` : null },
    { key: "reference", label: "Справка", count: reference?.length ? String(reference.length) : null },
  ];

  return (
    <Tabs value={view} onValueChange={(v) => setInfoView(v as InfoView)} className="gap-4 pb-20 animate-fade-up">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl p-1 lg:mx-auto lg:max-w-md">
        {views.map((v) => (
          <TabsTrigger
            key={v.key}
            value={v.key}
            className={cn(
              "min-h-11 rounded-xl text-sm font-semibold text-muted-foreground dark:text-muted-foreground",
              "data-[state=active]:bg-card data-[state=active]:text-foreground dark:data-[state=active]:bg-white/12 dark:data-[state=active]:text-foreground"
            )}
          >
            {v.label}
            {v.count && <span className="ml-1.5 text-xs font-medium tabular-nums opacity-70">{v.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>

      {!online && (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
          Нет сети. Показываем копию с этого устройства, правки недоступны
        </p>
      )}

      {/* Смонтированы всегда: иначе раскрытые группы сворачивались бы при каждом переключении */}
      <TabsContent value="checklist" forceMount className="data-[state=inactive]:hidden">
        <ChecklistSection trip={trip} canEdit={canEdit && online} today={today} />
      </TabsContent>
      <TabsContent value="reference" forceMount className="data-[state=inactive]:hidden">
        <ReferenceSection canEdit={canEdit && online} />
      </TabsContent>
    </Tabs>
  );
}
