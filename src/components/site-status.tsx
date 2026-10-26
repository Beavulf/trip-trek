"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Wrench, X } from "lucide-react";
import { isMaintenanceExempt, type SiteStatus } from "@/lib/maintenance";

// Статус сайта для всех экранов: баннер-объявление («в 23:00 обновление»), заглушка техработ
// поверх приложения (для не-админов) и подсказка админу, что режим включён.
// Опрос раз в минуту (раз в 15 секунд, пока идут работы — чтобы вкладка сама ожила, когда они
// закончатся) и при возврате во вкладку. Сбой запроса (сервер перезапускается) молча игнорируем:
// заглушку покажет сам сервер или Caddy.

const DISMISS_KEY = "tt-announcement-dismissed";

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function SiteStatusLayer() {
  const pathname = usePathname() || "/";
  const { data } = useQuery<SiteStatus>({
    queryKey: ["app-status"],
    queryFn: async () => {
      const r = await fetch("/api/app-status", { cache: "no-store" });
      if (!r.ok) throw new Error("status");
      return r.json();
    },
    refetchInterval: (q) => (q.state.data?.maintenance ? 15_000 : 60_000),
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  // Работы закончились, пока вкладка висела на заглушке, — перезагружаем страницу целиком:
  // за время работ мог выйти новый билд, старый JS-бандл с новым сервером не дружит
  const wasBlocked = useRef(false);
  const blocked = Boolean(data?.maintenance && !data.admin && !isMaintenanceExempt(pathname));
  useEffect(() => {
    if (blocked) {
      wasBlocked.current = true;
    } else if (wasBlocked.current && data && !data.maintenance) {
      window.location.reload();
    }
  }, [blocked, data]);

  // Баннер рисуется только после ответа /api/app-status (на клиенте), поэтому читать
  // sessionStorage в инициализаторе безопасно — расхождения с серверной разметкой нет
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  if (!data) return null;

  if (blocked) {
    return (
      <div
        role="alert"
        className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-background p-6 text-center"
      >
        <div className="max-w-sm space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
            <Wrench className="size-7" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Технические работы</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{data.message}</p>
          <p className="text-xs text-muted-foreground/80">Ваши данные в безопасности. Страница обновится сама.</p>
        </div>
      </div>
    );
  }

  // Строка про работы: админу (приложение для него открыто) и гостю на странице входа
  if (data.maintenance) {
    const onLogin = pathname === "/login" || pathname.startsWith("/login/");
    if (data.admin || onLogin) {
      return (
        <Strip tone="amber" icon={<Wrench className="size-4 shrink-0" aria-hidden />}>
          {data.admin
            ? "Режим техработ включён: пользователи видят заглушку, вы — приложение. Выключить: Админка → Настройки."
            : `Идут технические работы — войти сможет только администратор. ${data.message ?? ""}`}
        </Strip>
      );
    }
    return null;
  }

  if (data.announcement && data.announcement !== dismissed) {
    return (
      <Strip
        tone="info"
        icon={<Megaphone className="size-4 shrink-0" aria-hidden />}
        onClose={() => {
          setDismissed(data.announcement);
          try {
            sessionStorage.setItem(DISMISS_KEY, data.announcement ?? "");
          } catch {
            /* приватный режим — просто закроем до перезагрузки */
          }
        }}
      >
        {data.announcement}
      </Strip>
    );
  }
  return null;
}

function Strip({
  tone,
  icon,
  onClose,
  children,
}: {
  tone: "amber" | "info";
  icon: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const color =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-200"
      : "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-100";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div
        role="status"
        className={`pointer-events-auto mx-auto flex max-w-md items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug shadow-lg backdrop-blur ${color}`}
      >
        <span className="mt-0.5">{icon}</span>
        <p className="min-w-0 flex-1">{children}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть объявление"
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-lg hover:bg-foreground/10"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
