"use client";

import { CalendarClock, Copy, Globe, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePublicShare, type PublicSharePatch } from "@/hooks/trip/use-public-share";

// Управление публичной страницей поездки (/p/<token> — журнал «только
// смотреть» для гостей). Живёт в «О поездке» и в шите «Поделиться» из
// «Маршрута»: настройка доступности поездки наружу. Данные — общий хук
// usePublicShare; управляет ссылкой только владелец (гард и в API),
// остальные участники (кроме зрителей) видят ссылку и копируют (canManage=false).

// Срок отсчитывается от момента нажатия: «ещё неделя» — удобнее, чем выбирать дату
const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 1, label: "1 день" },
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
  { days: null, label: "Бессрочно" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";

export function PublicShareSettings({ tripId, canManage = true }: { tripId: string; canManage?: boolean }) {
  const { state, url, update, updating } = usePublicShare(tripId);
  const busy = updating;

  const updateWithToast = (patch: PublicSharePatch) => {
    if (busy) return;
    update(patch, {
      onSuccess: () => {
        if (patch.enabled) toast.success(patch.rotate ? "Свежая ссылка готова — старая закрыта" : "Публичная страница готова 🌍");
        else if (patch.enabled === false) toast.info("Публичная страница выключена");
        else if (patch.expiresInDays !== undefined) {
          toast.success(patch.expiresInDays === null ? "Ссылка теперь бессрочная" : "Срок ссылки обновлён");
        } else toast.success(patch.allowDownload ? "Гости смогут скачать фото" : "Скачивание для гостей запрещено");
      },
      onError: () => toast.error("Не удалось обновить ссылку"),
    });
  };

  const toggleCls = (on: boolean) =>
    cn(
      "relative shrink-0 min-h-7 h-7 w-12 rounded-full transition-colors disabled:opacity-50",
      on ? "bg-emerald-500" : "bg-muted-foreground/30"
    );
  const knobCls = (on: boolean) =>
    cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1");

  // Не-владельцу: ссылка на копирование, без тумблеров/срока/rotate
  if (!canManage) {
    if (!state) return null; // ещё грузится — чтобы не мигала заметка «включит владелец»
    if (!(state.enabled && state.token)) {
      return (
        <div className="rounded-2xl border border-border p-3 flex items-center gap-2.5 text-muted-foreground">
          <Globe className="size-4 shrink-0" />
          <p className="text-xs leading-snug">
            Публичный «живой журнал» поездки выключен — включить его может владелец.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-border p-3 space-y-2.5">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
            публичный доступ
          </div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="size-3.5" /> Публичная страница
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Живой журнал поездки «только смотреть»: фото с подписями, маршрут и карта — без входа в аккаунт.
        </p>
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
        <p className="text-[11px] text-muted-foreground">Настройки ссылки — у владельца поездки.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
            публичный доступ
          </div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="size-3.5" /> Публичная страница
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateWithToast({ enabled: !state?.enabled })}
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
              onClick={() => updateWithToast({ allowDownload: !state.allowDownload })}
              disabled={busy}
              className={toggleCls(state.allowDownload)}
              aria-label={
                state.allowDownload ? "Запретить гостям скачивать фото" : "Разрешить гостям скачивать фото"
              }
            >
              <span className={knobCls(state.allowDownload)} />
            </button>
          </label>

          {/* Срок действия: по умолчанию бессрочно; истёкшая ссылка у гостей закрыта, токен тот же —
              продлил, и она снова работает */}
          <div className="rounded-lg bg-muted/50 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <CalendarClock className="size-3.5" /> Срок действия ссылки
            </div>
            <p className={cn("text-[11px] leading-snug", state.expired ? "text-rose-500 font-medium" : "text-muted-foreground")}>
              {state.expired
                ? `Срок вышел ${fmtDate(state.expiresAt)} — гости видят «срок закончился». Продлите, чтобы открыть снова.`
                : state.expiresAt
                  ? `Действует до ${fmtDate(state.expiresAt)}`
                  : "Бессрочно"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={String(o.days)}
                  type="button"
                  onClick={() => updateWithToast({ expiresInDays: o.days })}
                  disabled={busy}
                  className="min-h-8 rounded-full border border-border bg-card px-3 text-[11px] font-medium hover:bg-accent active:scale-95 transition-all disabled:opacity-50"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateWithToast({ enabled: true, rotate: true })}
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
