"use client";

import { usePushNotifications } from "@/hooks/use-push";
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function PushSettings() {
  const { data: session } = useAuth();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const { permission, subscribed, loading, supported, subscribe, unsubscribe } = usePushNotifications();

  const handleToggle = async (next: boolean) => {
    if (!userId) {
      toast.error("Войдите чтобы включить уведомления");
      return;
    }
    if (!supported) {
      toast.error("Push не поддерживается в этом браузере");
      return;
    }
    if (!next) {
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
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-xl grid place-items-center shrink-0 transition-colors",
            subscribed ? "bg-green-500/15 text-green-600" : "bg-primary/10 text-primary"
          )}
        >
          <BellRing className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Уведомления</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {subscribed
              ? "Включены: фото, места, траты, дневник, чат"
              : "Фото, места, траты и чат — по событиям поездки"}
          </div>
        </div>
        <Switch
          checked={subscribed}
          onCheckedChange={handleToggle}
          disabled={loading || !userId || !supported}
          aria-label={subscribed ? "Отключить уведомления" : "Включить уведомления"}
        />
      </div>

      {!userId && (
        <p className="mt-2.5 text-xs text-amber-700 dark:text-amber-400">Нужен вход в аккаунт.</p>
      )}

      {!supported && (
        <p className="mt-2.5 text-xs text-muted-foreground">Этот браузер не поддерживает push.</p>
      )}

      {permission === "denied" && (
        <div className="mt-2.5 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600">
          Уведомления заблокированы в браузере. Разреши их в настройках сайта.
        </div>
      )}
    </div>
  );
}
