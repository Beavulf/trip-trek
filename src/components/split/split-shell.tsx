"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, CircleHelp, Loader2, Plane } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { NotificationsBell } from "@/components/trip/notifications-bell";
import { UserAvatar } from "@/components/trip/user-avatar";
import { SplitTourHost } from "@/components/trip/onboarding/tour-host";
import { useTourStore } from "@/lib/tour-store";

// Оболочка страниц «Сочтёмся»: лёгкая шапка (назад/лого, переключатель на поездки, уведомления, профиль).
// 16 вкладок поездки здесь ни к чему — это отдельное повседневное приложение (ADR-0009).

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Куда ведёт «назад»; без него в шапке логотип раздела */
  backHref?: string;
  /** Значок слева от названия (эмодзи группы) */
  lead?: ReactNode;
  /** Липкие вкладки под заголовком */
  tabs?: ReactNode;
  children: ReactNode;
}

export function SplitShell({ title, subtitle, backHref, lead, tabs, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useAuth();
  const openTour = useTourStore((s) => s.openTour);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    // Вернуться туда же после входа (адрес группы, а не главная поездки)
    const back = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    router.replace(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated" || !session?.user) {
    return (
      <div className="min-h-dvh grid place-items-center bg-background">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Загрузка" />
      </div>
    );
  }
  const u = session.user;

  return (
    <div className="min-h-dvh flex flex-col bg-background relative">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle at 20% 0%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 80% 100%, #06b6d4 0%, transparent 50%)" }}
      />
      <header className="sticky top-0 z-40 glass-strong border-b border-border/80 pt-safe">
        <div className="mx-auto max-w-2xl px-3 h-14 flex items-center gap-2">
          {backHref ? (
            <Link href={backHref} aria-label="К списку групп" className="size-11 -ml-2 shrink-0 grid place-items-center rounded-full hover:bg-accent active:scale-95 transition-transform">
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <div className="size-9 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 grid place-items-center text-white shadow-lg shadow-emerald-500/20" aria-hidden>
              <span className="font-bold text-base">₽</span>
            </div>
          )}
          {lead && <span className="text-xl shrink-0" aria-hidden>{lead}</span>}
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-base leading-tight truncate">{title}</h1>
            {subtitle && <div className="text-[11px] text-muted-foreground leading-tight truncate">{subtitle}</div>}
          </div>
          <Link
            href="/"
            aria-label="Поездки"
            className="shrink-0 inline-flex items-center gap-1.5 min-h-10 min-w-10 justify-center px-2.5 min-[420px]:px-3 rounded-full border border-border bg-card/60 text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-colors"
          >
            <Plane className="size-4" aria-hidden />
            <span className="hidden min-[420px]:inline">Поездки</span>
          </Link>
          <button
            type="button"
            onClick={() => openTour(pathname === "/split" ? "split-hub" : "split-group")}
            aria-label="Подсказки раздела"
            className="shrink-0 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
          >
            <CircleHelp className="size-5" aria-hidden />
          </button>
          <NotificationsBell authed scope="split" />
          <Link href="/profile" aria-label="Профиль" className="shrink-0 active:scale-95 transition-transform">
            <UserAvatar name={u.name} emoji={u.emoji ?? "👤"} color={u.color ?? "#94a3b8"} avatarUrl={u.avatarUrl} className="size-9" textClassName="text-base" />
          </Link>
        </div>
        {tabs && <div className="mx-auto max-w-2xl px-3 pb-2">{tabs}</div>}
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-3 py-4 pb-28 safe-bottom relative z-0">{children}</main>
      {/* Обучение «Сочтёмся»: тур первого экрана и группы открываются сами, «?» в шапке — вручную */}
      <SplitTourHost />
    </div>
  );
}
