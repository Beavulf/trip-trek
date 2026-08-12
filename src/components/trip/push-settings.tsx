"use client";

import { usePushNotifications } from "@/hooks/use-push";
import { Bell, BellOff, Loader2, Check, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrentTripId } from "@/hooks/use-trip";

export function PushSettings() {
  const currentTripId = useCurrentTripId();
  const { permission, subscribed, loading, subscribe, unsubscribe } = usePushNotifications(currentTripId);
  const noTrip = !currentTripId;

  const handleToggle = async () => {
    if (noTrip) {
      toast.error("Сначала выберите поездку");
      return;
    }
    if (subscribed) {
      const result = await unsubscribe();
      if (result.success) toast.success("Уведомления отключены");
    } else {
      const result = await subscribe();
      if (result.success) {
        toast.success("Подписка сохранена", {
          description: "Полноценный push (VAPID) ещё в разработке — пока работает локально в браузере",
        });
      } else {
        toast.error("Не удалось включить уведомления", {
          description: result.error || "Проверь разрешения браузера",
        });
      }
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <BellRing className="size-4" /> Push-уведомления
        </h2>
        <button
          onClick={handleToggle}
          disabled={loading || noTrip}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
            subscribed
              ? "bg-green-500/10 text-green-600 border border-green-500/30"
              : "bg-primary text-primary-foreground"
          )}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : subscribed ? (
            <>
              <Check className="size-3.5" /> Включены
            </>
          ) : (
            <>
              <Bell className="size-3.5" /> Включить
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed mb-2">
        Черновик: подписка сохраняется, доставка по событиям поездки ещё не подключена к VAPID.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Планируемые события: фото, места, траты, дневник, чат.
      </p>

      {permission === "denied" && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600">
          Уведомления заблокированы в браузере. Разреши их в настройках сайта.
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-3">
        Для Push API нужен HTTPS. Без поездки кнопка недоступна.
      </p>
    </div>
  );
}
