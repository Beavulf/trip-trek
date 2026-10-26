"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Bell,
  BellRing,
  Bot,
  CheckCheck,
  Crown,
  KeyRound,
  Mail,
  MessageSquareReply,
  MessageSquareWarning,
  ChevronLeft,
  ShieldBan,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserMinus,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import { useTourStore } from "@/lib/tour-store";
import { getUpdate } from "@/lib/updates-content";
import type { UpdatesScope } from "@/lib/updates";
import type { TourRole } from "@/lib/onboarding-content";
import { useAuth } from "@/hooks/use-auth";
import { useTrip } from "@/hooks/trip/use-trip";
import { useTourActions } from "@/hooks/use-tour-actions";
import { useUpdates } from "@/hooks/use-updates";
import { UpdateDetail, UpdatesList } from "@/components/trip/updates/updates-feed";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useNotifications, useMarkNotificationsRead, type UserNotificationItem } from "@/hooks/use-notifications";

/** «5 мин назад» — локально, без импорта из админки */
function relTimeAdmin(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

// Колокольчик: две вкладки одного окна — «Уведомления» (события, ответы на обращения) и
// «Обновления» (что нового в приложении, с демо; src/lib/updates-content.ts). Красный счётчик
// суммирует непрочитанное из обоих. Кнопка в шапке + шторка (портал, как остальные оверлеи).

const TYPE_ICON: Record<string, React.ReactNode> = {
  premium: <Crown className="size-4 text-amber-500" />,
  password: <KeyRound className="size-4 text-rose-500" />,
  member_removed: <UserMinus className="size-4 text-rose-500" />,
  member_banned: <ShieldBan className="size-4 text-rose-500" />,
  member_unbanned: <ShieldCheck className="size-4 text-emerald-500" />,
  member_left: <UserMinus className="size-4 text-sky-500" />,
  trip_deleted: <Trash2 className="size-4 text-rose-500" />,
  feedback_reply: <MessageSquareReply className="size-4 text-emerald-500" />,
  feedback_new: <MessageSquareWarning className="size-4 text-amber-500" />,
  admin_message: <Mail className="size-4 text-sky-500" />,
  ownership: <Crown className="size-4 text-amber-500" />,
  ai_blocked: <ShieldBan className="size-4 text-rose-500" />,
  ai_unblocked: <Sparkles className="size-4 text-emerald-500" />,
  ai_spend_alert: <Bot className="size-4 text-amber-500" />,
  split_payment: <Wallet className="size-4 text-emerald-500" />,
  split_reminder: <BellRing className="size-4 text-amber-500" />,
};

function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type SheetTab = "notifications" | "updates";

export function NotificationsBell({ authed, large, scope = "trip" }: { authed: boolean; large?: boolean; scope?: UpdatesScope }) {
  const [open, setOpen] = useState(false);
  // Какая вкладка откроется: та, где есть непрочитанное (уведомления в приоритете)
  const [initialTab, setInitialTab] = useState<SheetTab>("notifications");
  useBodyScrollLock(open);
  const { data } = useNotifications(authed);
  const updates = useUpdates(scope);
  const notifUnread = data?.unread ?? 0;
  const unread = notifUnread + updates.unread;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setInitialTab(notifUnread === 0 && updates.unread > 0 ? "updates" : "notifications");
            setOpen(true);
          }}
          aria-label={unread > 0 ? `Уведомления и обновления: ${unread} новых` : "Уведомления и обновления"}
          title="Уведомления и обновления"
          className={cn(
            "rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors shrink-0 relative",
            large ? "size-11" : "size-9 sm:size-8"
          )}
        >
          <Bell className={cn(large ? "size-5" : "size-4")} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-background pointer-events-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <AnimatePresence>
          {open && (
            <NotificationsSheet
              onClose={() => setOpen(false)}
              items={data?.items ?? []}
              notifUnread={notifUnread}
              scope={scope}
              initialTab={initialTab}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function roleOf(trip: { participants: { id: string; role?: string | null }[] } | undefined, userId: string | undefined): TourRole | null {
  const r = trip?.participants.find((p) => p.id === userId)?.role;
  if (!r) return null;
  return r === "owner" ? "owner" : r === "viewer" ? "viewer" : "member";
}

function NotificationsSheet({
  items,
  notifUnread,
  scope,
  initialTab,
  onClose,
}: {
  items: UserNotificationItem[];
  notifUnread: number;
  scope: UpdatesScope;
  initialTab: SheetTab;
  onClose: () => void;
}) {
  const markRead = useMarkNotificationsRead();
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const updates = useUpdates(scope);
  const { data: session } = useAuth();
  const { data: trip } = useTrip();
  const runAction = useTourActions();
  const openTour = useTourStore((st) => st.openTour);
  const openEntry = openId ? getUpdate(openId) : undefined;

  // лист смонтирован только пока открыт — «назад» закрывает его, а не приложение;
  // открытая запись — второй слой: «назад» сначала возвращает к списку
  useBackDismiss(true, onClose);
  useBackDismiss(!!openEntry, () => setOpenId(null));

  // Уведомления читаются, когда их видно (вкладку «Обновления» это не касается).
  // Лёгкая задержка, чтобы бейдж успели увидеть
  useEffect(() => {
    if (tab === "notifications" && notifUnread > 0) {
      const t = setTimeout(() => markRead.mutate({ all: true }), 1200);
      return () => clearTimeout(t);
    }
  }, [tab, notifUnread, markRead]);

  const doAction = (action: Parameters<typeof runAction>[0] | "center") => {
    onClose();
    if (action === "center") useTourStore.getState().setCenterOpen(true);
    else runAction(action);
  };
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[env(safe-area-inset-bottom)] max-h-[85dvh] flex flex-col"
        >
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur pl-3 pr-1 py-2.5 border-b border-border flex items-center justify-between gap-1">
            {openEntry ? (
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="flex min-h-11 items-center gap-1 rounded-full pl-1 pr-3 text-sm font-semibold hover:bg-accent"
              >
                <ChevronLeft className="size-5" aria-hidden /> Обновления
              </button>
            ) : (
              <div role="tablist" aria-label="Раздел" className="flex min-w-0 flex-1 gap-1 rounded-full bg-secondary p-1">
                <SheetTabButton active={tab === "notifications"} onClick={() => setTab("notifications")} count={notifUnread}>
                  Уведомления
                </SheetTabButton>
                <SheetTabButton active={tab === "updates"} onClick={() => setTab("updates")} count={updates.unread}>
                  Обновления
                </SheetTabButton>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={onClose}
                className="size-11 rounded-full hover:bg-accent grid place-items-center"
                aria-label="Закрыть"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto overscroll-contain min-h-[min(30rem,60dvh)]">
            {!openEntry && (tab === "notifications" ? notifUnread > 0 : updates.unread > 0) && (
              <div className="flex justify-end border-b border-border px-2 py-1">
                <button
                  type="button"
                  onClick={() => (tab === "notifications" ? markRead.mutate({ all: true }) : updates.markAllRead())}
                  className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" aria-hidden /> Отметить всё прочитанным
                </button>
              </div>
            )}
            {tab === "updates" ? (
              openEntry ? (
                <UpdateDetail
                  entry={openEntry}
                  scope={scope}
                  role={roleOf(trip, session?.user?.id)}
                  onMarkRead={(id) => updates.markRead([id])}
                  onAction={doAction}
                  onTour={(id) => {
                    onClose();
                    openTour(id);
                  }}
                />
              ) : (
                <UpdatesList items={updates.items} onOpen={setOpenId} />
              )
            ) : items.length === 0 ? (
              <div className="py-14 text-center space-y-2 px-6">
                <div className="text-4xl">🔔</div>
                <p className="text-sm font-medium">Пока пусто</p>
                <p className="text-xs text-muted-foreground">
                  Здесь появятся события: ответы на твои обращения, изменения в поездках, сообщения админа.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((n) => {
                  const inner = (
                    <div className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-primary/5")}>
                      <span className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0 mt-0.5">
                        {TYPE_ICON[n.type] || <Bell className="size-4 text-muted-foreground" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">{n.body}</p>}
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80 mt-1" title={fmtDateTime(n.createdAt)}>
                          {relTimeAdmin(n.createdAt)}
                        </p>
                      </div>
                      {!n.readAt && <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden />}
                    </div>
                  );
                  // Ответ на обращение открываем окном поверх текущего экрана, не перезагружая страницу
                  const feedbackId = n.url?.startsWith("/?feedback=") ? decodeURIComponent(n.url.slice("/?feedback=".length)) : null;
                  return feedbackId ? (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        useTripStore.getState().openFeedback(feedbackId);
                      }}
                      className="block w-full text-left hover:bg-accent/40 transition-colors"
                    >
                      {inner}
                    </button>
                  ) : n.url ? (
                    <Link key={n.id} href={n.url} onClick={onClose} className="block hover:bg-accent/40 transition-colors">
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function SheetTabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex min-h-9 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-[13px] font-semibold transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="truncate">{children}</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-secondary">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
