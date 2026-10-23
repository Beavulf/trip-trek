"use client";

import { Copy, Globe, Link2, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { PublicShareSettings } from "./trip-public-share";
import { usePublicShare } from "@/hooks/trip/use-public-share";
import { resolveShareAction } from "@/lib/share-action";

// Быстрый шеринг публичной страницы (/p/<token>) из hero «Маршрута».
// Копия — главный сценарий, «Поделиться…» открывает системное меню телефона
// (где Web Share API нет, сама кнопка деградирует в копирование).
// Настройки ссылки — та же карточка, что в «О поездке»; рендерит только владелец.

export function ShareTripSheet({
  open,
  onOpenChange,
  tripId,
  tripTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tripId: string;
  tripTitle: string;
}) {
  const { state, url, isLoading, isError, refetch, update, updating } = usePublicShare(tripId);

  const copyLink = () => {
    void navigator.clipboard?.writeText(url).then(
      () => toast.success("Ссылка скопирована — можно отправлять кому угодно"),
      () => toast.error("Не удалось скопировать")
    );
  };

  const shareNative = async () => {
    if (resolveShareAction(navigator) === "clipboard") {
      copyLink();
      return;
    }
    try {
      await navigator.share({ title: tripTitle || "TripTrek", url });
    } catch (e) {
      // AbortError — юзер сам закрыл системное меню, это не ошибка
      if ((e as DOMException)?.name === "AbortError") return;
      copyLink();
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Поделиться поездкой" titleIcon={<Share2 className="size-4 text-primary" />}>
      {isLoading ? (
        <div className="py-10 grid place-items-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : isError ? (
        <div className="py-8 text-center space-y-3">
          <Link2 className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-medium">Не удалось загрузить ссылку</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-11"
          >
            Повторить
          </button>
        </div>
      ) : state?.enabled && state.token ? (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <code className="flex-1 min-w-0 truncate text-[11px] bg-muted rounded-lg px-2 py-2">{url}</code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 size-9 rounded-lg border border-border grid place-items-center hover:bg-muted active:scale-95 transition-transform"
              aria-label="Скопировать публичную ссылку"
            >
              <Copy className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void shareNative()}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors active:scale-[0.98]"
          >
            <Share2 className="size-4" /> Поделиться…
          </button>

          <PublicShareSettings tripId={tripId} />
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <div className="rounded-2xl bg-muted/50 p-3 text-[12px] leading-snug text-muted-foreground">
            Публичный «живой журнал» поездки: фото и маршрут можно открыть без входа в аккаунт.
            Деньги, чат и дневник остаются приватными.
          </div>
          <button
            type="button"
            onClick={() =>
              update(
                { enabled: true },
                { onSuccess: () => toast.success("Публичная страница готова 🌍") }
              )
            }
            disabled={updating}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {updating ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
            Включить и поделиться
          </button>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <RefreshCw className="size-3" /> Ссылку потом можно сменить — старая закроется.
          </p>
        </div>
      )}
    </MobileBottomSheet>
  );
}
