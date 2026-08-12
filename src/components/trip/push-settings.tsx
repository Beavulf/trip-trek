"use client";

import { usePushNotifications } from "@/hooks/use-push";
import { Bell, Loader2, Check, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function PushSettings() {
  const { data: session } = useAuth();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const { permission, subscribed, loading, supported, subscribe, unsubscribe } = usePushNotifications();

  const handleToggle = async () => {
    if (!userId) {
      toast.error("Войдите чтобы включить уведомления");
      return;
    }
    if (!supported) {
      toast.error("Push не поддерживается в этом браузере");
      return;
    }
    if (subscribed) {
      const result = await unsubscribe();
      if (result.success) toast.success("Уведомления отключены");
      else toast.error("Не удалось отключить");
    } else {
      const result = await subscribe();
      if (result.success) {
        toast.success("Уведомления включены 🔔", {
          description: "Push работает даже при закрытом приложении (нужен HTTPS)",
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
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <BellRing className="size-4" /> Push-уведомления
        </h2>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || !userId || !supported}
          className={cn(
            "min-h-11 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
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

      <p className="text-xs text-muted-foreground leading-relaxed">
        Подписка через VAPID (как в профиле). События поездки: фото, места, траты, дневник, чат — когда сервер их шлёт.
      </p>

      {!userId && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Нужен вход в аккаунт.</p>
      )}

      {permission === "denied" && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600">
          Уведомления заблокированы в браузере. Разреши их в настройках сайта.
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-3">
        Для Push API нужен HTTPS (или localhost).
      </p>
    </div>
  );
}
