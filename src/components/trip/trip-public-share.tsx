"use client";

import { useEffect, useState } from "react";
import { Copy, Globe, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Управление публичной страницей поездки (/p/<token> — журнал «только
// смотреть» для родных). Живёт в «О поездке» рядом с кодом приглашения:
// это настройка доступности поездки наружу, а не действие шаринга.
// Доступно только владельцу (гарды и в API).

interface PublicShareState {
  enabled: boolean;
  token: string | null;
  allowDownload: boolean;
}

export function PublicShareSettings({ tripId }: { tripId: string }) {
  const [state, setState] = useState<PublicShareState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    fetch(`/api/trip/share?tripId=${encodeURIComponent(tripId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicShareState | null) => {
        if (alive && d)
          setState({ enabled: !!d.enabled, token: d.token ?? null, allowDownload: d.allowDownload !== false });
      })
      .catch(() => {
        // состояние ссылки не критично для экрана — тихо пропускаем
      });
    return () => {
      alive = false;
    };
  }, [tripId]);

  const update = async (patch: { enabled?: boolean; rotate?: boolean; allowDownload?: boolean }) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/trip/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, ...patch }),
      });
      if (!r.ok) throw new Error("failed");
      const d = (await r.json()) as PublicShareState;
      setState({ enabled: d.enabled, token: d.token, allowDownload: d.allowDownload });
      if (patch.enabled) toast.success(patch.rotate ? "Свежая ссылка готова — старая закрыта" : "Публичная страница готова 🌍");
      else if (patch.enabled === false) toast.info("Публичная страница выключена");
      else toast.success(patch.allowDownload ? "Гости смогут скачать фото" : "Скачивание для гостей запрещено");
    } catch {
      toast.error("Не удалось обновить ссылку");
    } finally {
      setBusy(false);
    }
  };

  const url =
    state?.token && typeof window !== "undefined" ? `${window.location.origin}/p/${state.token}` : "";

  const toggleCls = (on: boolean) =>
    cn(
      "relative shrink-0 min-h-7 h-7 w-12 rounded-full transition-colors disabled:opacity-50",
      on ? "bg-emerald-500" : "bg-muted-foreground/30"
    );
  const knobCls = (on: boolean) =>
    cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1");

  return (
    <div className="rounded-2xl border border-border p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
            ссылка для родных
          </div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="size-3.5" /> Публичная страница
          </div>
        </div>
        <button
          type="button"
          onClick={() => void update({ enabled: !state?.enabled })}
          disabled={busy}
          aria-pressed={!!state?.enabled}
          className={toggleCls(!!state?.enabled)}
          aria-label={state?.enabled ? "Выключить публичную страницу" : "Включить публичную страницу"}
        >
          <span className={knobCls(!!state?.enabled)} />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Живой журнал поездки «только смотреть»: фото с подписями, маршрут и карта — без входа в аккаунт.
        Деньги, чат и дневник не показываются.
      </p>
      {state?.enabled && state.token && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <code className="flex-1 min-w-0 truncate text-[11px] bg-muted rounded-lg px-2 py-2">{url}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(
                  () => toast.success("Ссылка скопирована — можно отправлять кому угодно"),
                  () => toast.error("Не удалось скопировать")
                );
              }}
              className="shrink-0 size-9 rounded-lg border border-border grid place-items-center hover:bg-muted active:scale-95 transition-transform"
              aria-label="Скопировать публичную ссылку"
            >
              <Copy className="size-3.5" />
            </button>
          </div>

          {/* Скачивание фото гостями: ZIP-архив с публичной страницы */}
          <label className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
            <span className="text-[11px] font-medium leading-snug">
              Гости могут скачать фото
              <span className="block text-muted-foreground font-normal">
                кнопкой «Скачать все фото» на странице
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={state.allowDownload}
              onClick={() => void update({ allowDownload: !state.allowDownload })}
              disabled={busy}
              className={toggleCls(state.allowDownload)}
              aria-label={
                state.allowDownload ? "Запретить гостям скачивать фото" : "Разрешить гостям скачивать фото"
              }
            >
              <span className={knobCls(state.allowDownload)} />
            </button>
          </label>

          <button
            type="button"
            onClick={() => void update({ enabled: true, rotate: true })}
            disabled={busy}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            <RefreshCw className="size-3" /> Новая ссылка — старая перестанет работать
          </button>
        </div>
      )}
    </div>
  );
}
