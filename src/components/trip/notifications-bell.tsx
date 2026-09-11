"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Crown,
  KeyRound,
  Mail,
  MessageSquareReply,
  ShieldBan,
  ShieldCheck,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

// Колокольчик уведомлений: события админ-действий и ответы на обращения.
// Кнопка в шапке + шторка-список (портал, как остальные оверлеи приложения).

const TYPE_ICON: Record<string, React.ReactNode> = {
  premium: <Crown className="size-4 text-amber-500" />,
  password: <KeyRound className="size-4 text-rose-500" />,
  member_removed: <UserMinus className="size-4 text-rose-500" />,
  member_banned: <ShieldBan className="size-4 text-rose-500" />,
  member_unbanned: <ShieldCheck className="size-4 text-emerald-500" />,
  trip_deleted: <Trash2 className="size-4 text-rose-500" />,
  feedback_reply: <MessageSquareReply className="size-4 text-emerald-500" />,
  admin_message: <Mail className="size-4 text-sky-500" />,
  ownership: <Crown className="size-4 text-amber-500" />,
};

function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NotificationsBell({ authed, large }: { authed: boolean; large?: boolean }) {
  const [open, setOpen] = useState(false);
  useBodyScrollLock(open);
  const { data } = useNotifications(authed);
  const markRead = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;

  // Открыл шторку → всё прочитано (лёгкая задержка, чтобы бейдж успели увидеть)
  useEffect(() => {
    if (open && unread > 0) {
      const t = setTimeout(() => markRead.mutate({ all: true }), 1200);
      return () => clearTimeout(t);
    }
  }, [open, unread, markRead]);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
          title="Уведомления"
          className={cn(
            "rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors shrink-0 relative",
            large ? "size-11" : "size-9 sm:size-8"
          )}
        >
          <Bell className={cn(large ? "size-5" : "size-4")} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold grid place-items-center ring-2 ring-background pointer-events-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <AnimatePresence>{open && <NotificationsSheet onClose={() => setOpen(false)} items={data?.items ?? []} />}</AnimatePresence>
      </div>
    </>
  );
}

function NotificationsSheet({ items, onClose }: { items: UserNotificationItem[]; onClose: () => void }) {
  const markRead = useMarkNotificationsRead();
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

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Bell className="size-4 text-primary" /> Уведомления
            </h2>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate({ all: true })}
                  className="size-11 rounded-full hover:bg-accent grid place-items-center text-muted-foreground"
                  aria-label="Отметить всё прочитанным"
                  title="Отметить всё прочитанным"
                >
                  <CheckCheck className="size-4" />
                </button>
              )}
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

          <div className="overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
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
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-1" title={fmtDateTime(n.createdAt)}>
                          {relTimeAdmin(n.createdAt)}
                        </p>
                      </div>
                      {!n.readAt && <span className="size-2 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden />}
                    </div>
                  );
                  return n.url ? (
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
