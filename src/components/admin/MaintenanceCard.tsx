"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { NOTICE_MAX_LENGTH } from "@/lib/maintenance";

// Техработы и объявление (src/lib/maintenance.ts). Два независимых рычага:
//  - объявление: баннер у всех, пока админ не очистит поле — «в 23:00 обновление»;
//  - режим техработ: не-админам заглушка и закрытый вход, админу приложение открыто.
// Включение режима — в два шага: он мгновенно закрывает сайт для всех остальных.

interface Props {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcement: string;
}

const areaCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring input-mobile resize-none";

export function MaintenanceCard({ maintenanceMode, maintenanceMessage, announcement }: Props) {
  const qc = useQueryClient();
  const [message, setMessage] = useState(maintenanceMessage);
  const [notice, setNotice] = useState(announcement);
  const [confirmOn, setConfirmOn] = useState(false);

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b;
    },
    onSuccess: (_b, patch) => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
      qc.invalidateQueries({ queryKey: ["app-status"] });
      setConfirmOn(false);
      if ("maintenanceMode" in patch) {
        toast.success(patch.maintenanceMode ? "Режим техработ включён" : "Режим техработ выключен");
      } else {
        toast.success("Сохранено");
      }
    },
    onError: (e: Error) => toast.error("Не удалось сохранить", { description: e.message }),
  });

  const noticeDirty = notice.trim() !== announcement;
  const messageDirty = message.trim() !== maintenanceMessage;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="size-4 text-amber-500" />
        <h2 className="font-semibold text-sm">Техработы и объявление</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Перед выкатом: за 15–30 минут напиши объявление — оно появится баннером у всех. Когда выкатываешь —
        включи режим техработ: пользователи увидят заглушку и не смогут войти, а ты (админ) продолжаешь работать.
        Когда сервер перезапускается, заглушку показывает сам сервер, а открытые вкладки обновятся сами.
      </p>

      {/* Объявление */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Megaphone className="size-4 text-sky-500" /> Объявление для всех
        </div>
        <textarea
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          maxLength={NOTICE_MAX_LENGTH}
          rows={2}
          placeholder="Сегодня в 23:00 обновление, ~3 минуты. Приложение будет недоступно."
          className={areaCls}
          aria-label="Текст объявления"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {notice.length}/{NOTICE_MAX_LENGTH} · пусто = баннера нет
          </span>
          <div className="flex gap-2">
            {announcement && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setNotice("");
                  save.mutate({ announcement: null });
                }}
                className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
              >
                Убрать баннер
              </button>
            )}
            <button
              type="button"
              disabled={!noticeDirty || save.isPending}
              onClick={() => save.mutate({ announcement: notice })}
              className="min-h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Опубликовать"}
            </button>
          </div>
        </div>
      </div>

      {/* Режим техработ */}
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Режим техработ</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {maintenanceMode
                ? "Включён: пользователям показывается заглушка, вход закрыт (кроме админов)."
                : "Выключен: приложение работает как обычно."}
            </p>
          </div>
          <Switch
            checked={maintenanceMode}
            disabled={save.isPending}
            onCheckedChange={(on) => {
              if (on) setConfirmOn(true);
              else save.mutate({ maintenanceMode: false });
            }}
            aria-label="Режим техработ"
          />
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={NOTICE_MAX_LENGTH}
          rows={2}
          placeholder="Текст заглушки. Пусто — стандартный: «Обновляем TripTrek. Это займёт несколько минут…»"
          className={areaCls}
          aria-label="Текст заглушки"
        />
        {messageDirty && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate({ maintenanceMessage: message })}
              className="min-h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Сохранить текст
            </button>
          </div>
        )}

        {confirmOn && (
          <div role="alertdialog" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <p className="text-xs leading-relaxed">
              Включить сейчас? Все, кроме админов, мгновенно потеряют доступ: увидят заглушку, войти не смогут.
              Открытые вкладки покажут её в течение 15 секунд.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOn(false)}
                className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate({ maintenanceMode: true, maintenanceMessage: message })}
                className="min-h-9 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-black disabled:opacity-50"
              >
                Включить техработы
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
