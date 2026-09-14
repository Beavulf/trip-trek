"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Share2, Users, Link as LinkIcon, Loader2, Lock, ScanLine } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { MemberManager } from "./member-manager";

export function InviteFriends({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const tripId = useCurrentTripId();
  const { data: trip, isLoading, isError, refetch } = useTrip();
  const { data: session } = useAuth();
  const { setTripSwitcherOpen } = useTripStore();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  if (!open || typeof document === "undefined") return null;

  const inviteCode = trip?.settings.inviteCode || "";
  const accent = trip?.trip?.coverColor || "#f97316";
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${encodeURIComponent(inviteCode)}`
      : `/join?code=${encodeURIComponent(inviteCode)}`;

  const flashCopied = (what: "link" | "code") => {
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyText = async (text: string, what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(what);
      toast.success(what === "link" ? "Ссылка скопирована! 📋" : "Код скопирован! 📋");
    } catch {
      toast.error("Не удалось скопировать", { description: "Скопируй вручную" });
    }
  };

  const copyLink = () => copyText(inviteUrl, "link");

  const share = async () => {
    if (!inviteCode) {
      toast.error("Код ещё загружается");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: trip?.settings.title || "TripTrek",
          text: `Присоединяйся к моей поездке! Код: ${inviteCode} 🌏`,
          url: inviteUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      await copyLink();
    }
  };

  const members = trip?.participants ?? [];
  const memberCount = members.length;
  const crowdHint = memberCount >= 5;

  // Страховка на стороне клиента: владелец мог запретить приглашать, пока
  // шторка была открыта или UI устарел; сервер в этом случае код не отдаёт
  const myId = session?.user?.id;
  const isOwner = !!myId && members.some((m) => m.id === myId && m.role === "owner");
  const inviteLocked = trip?.settings.allowMemberInvites === false && !isOwner;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-y-auto overscroll-contain max-h-[92dvh]"
        >
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Users className="size-4 text-primary" /> Пригласить друзей
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="size-11 rounded-full hover:bg-accent grid place-items-center"
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {!tripId ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-medium">Нет активной поездки</p>
                <p className="text-xs text-muted-foreground">Выбери поездку, чтобы пригласить друзей</p>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    setTripSwitcherOpen(true);
                  }}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium"
                >
                  Мои поездки →
                </button>
              </div>
            ) : isError ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-medium">Не удалось загрузить код</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium"
                >
                  Обновить
                </button>
              </div>
            ) : inviteLocked ? (
              <div className="py-10 text-center space-y-2 text-muted-foreground">
                <Lock className="size-5 mx-auto" />
                <p className="text-sm font-medium text-foreground">Приглашения ограничены</p>
                <p className="text-xs">Приглашать новых участников может только владелец поездки.</p>
              </div>
            ) : isLoading || !inviteCode ? (
              <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Загружаем код приглашения…
              </div>
            ) : (
              <>
                {/* QR с рамкой цвета поездки */}
                <div className="flex justify-center">
                  <div className="p-1.5 rounded-3xl shadow-lg" style={{ background: accent }}>
                    <div className="bg-white p-3.5 rounded-[18px]">
                      <QRCodeSVG
                        value={inviteUrl}
                        size={168}
                        level="M"
                        fgColor="#1c1917"
                        bgColor="#ffffff"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-center text-sm text-muted-foreground -mt-1">
                  Покажи QR-код другу или отправь ссылку
                </p>

                {/* Код с кнопкой копирования */}
                <button
                  type="button"
                  onClick={() => copyText(inviteCode, "code")}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-2xl bg-muted/60 border border-border hover:border-primary/40 transition-colors"
                  aria-label="Скопировать код приглашения"
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Код поездки</span>
                    {/* min-w-0 + truncate: длинный cuid-код обрезается, не выталкивая кнопку копирования */}
                    <span className="w-full font-mono font-black text-base tracking-[0.12em] truncate">{inviteCode}</span>
                  </span>
                  <span
                    className={cn(
                      "size-11 rounded-xl grid place-items-center shrink-0 transition-colors",
                      copied === "code" ? "bg-green-500 text-white" : "bg-secondary hover:bg-accent"
                    )}
                  >
                    {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </span>
                </button>

                {/* Ссылка */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50">
                  <LinkIcon className="size-4 text-muted-foreground shrink-0" />
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 bg-transparent text-xs outline-none text-muted-foreground"
                    aria-label="Ссылка-приглашение"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className={cn(
                      "size-11 rounded-lg grid place-items-center transition-colors shrink-0",
                      copied === "link" ? "bg-green-500 text-white" : "bg-secondary hover:bg-accent"
                    )}
                    aria-label="Копировать ссылку"
                  >
                    {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={share}
                  className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Share2 className="size-4" />
                  Поделиться поездкой
                </button>

                {/* Как присоединиться — реальная последовательность шагов */}
                <div className="rounded-2xl border border-border p-3 space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Как присоединиться
                  </span>
                  {[
                    { icon: <ScanLine className="size-4" />, text: "Друг сканирует QR или открывает ссылку" },
                    { icon: <Users className="size-4" />, text: "Входит или регистрируется за полминуты" },
                    { icon: <Check className="size-4 text-green-500" />, text: "Сразу попадает в поездку" },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="size-8 rounded-lg bg-muted grid place-items-center text-muted-foreground shrink-0">
                        {s.icon}
                      </span>
                      <span className="text-xs text-muted-foreground leading-snug">{s.text}</span>
                    </div>
                  ))}
                </div>

                {/* Кто уже в поездке */}
                {members.length > 0 && (
                  <div className="rounded-2xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Уже в поездке
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {memberCount}
                        {!crowdHint && "/5"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-1.5 pr-2 py-0.5 rounded-full bg-muted/60">
                          <span
                            className="size-6 rounded-full grid place-items-center text-[11px] border-2 border-card"
                            style={{ background: m.color }}
                          >
                            {m.emoji}
                          </span>
                          <span className="text-[11px] font-medium truncate max-w-24">{m.name}</span>
                          {m.role === "owner" && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              owner
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {crowdHint && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 leading-snug">
                        Больше 5 участников — если у владельца поездки Premium
                      </p>
                    )}
                  </div>
                )}

                {/* Управление участниками (только владелец поездки) */}
                <MemberManager tripId={tripId} members={members} refetch={refetch} />
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
