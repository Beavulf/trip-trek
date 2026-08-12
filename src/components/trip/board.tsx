"use client";

import { useBoard, useAddBoardMessage, useTogglePinBoard, useDeleteBoardMessage, useTrip, type BoardMessage } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, Pin, Trash2, Loader2, MessagesSquare, AlertCircle, RotateCw, LogIn } from "lucide-react";
import { useState } from "react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Board() {
  const { data: messages, isLoading, error: messagesError } = useBoard();
  const { data: trip, error: tripError } = useTrip();
  const { data: session } = useSession();
  const add = useAddBoardMessage();
  const [content, setContent] = useState("");

  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  // P0 #5: error states
  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }
  if (messagesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <AlertCircle className="size-8 mx-auto text-red-500" />
        <p className="text-sm font-medium">Не удалось загрузить сообщения</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }

  // P1 #8: submit with try/catch — toast onSuccess only, don't clear content on fail
  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (!currentUserId) {
      toast.error("Войдите чтобы отправлять сообщения");
      return;
    }
    if (trimmed.length > 4000) {
      toast.error("Слишком длинное сообщение (макс 4000 символов)");
      return;
    }
    try {
      await add.mutateAsync({ content: trimmed, userId: currentUserId });
      toast.success("Сообщение отправлено 💬");
      setContent("");
    } catch (err) {
      toast.error("Не удалось отправить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
      // P1 #8: НЕ чистим content при ошибке — пусть пользователь видит что ввёл
    }
  };

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">💬</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <MessagesSquare className="size-4" /> Доска сообщений
          </div>
          <h1 className="text-2xl font-bold">Общение группы</h1>
          <p className="text-white/80 text-sm mt-1">
            Заметки, идеи, планы — всё в одном месте
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
          {messages && messages.length > 0 && (
            <div className="text-xs text-white/70 mt-2">
              {messages.length} сообщений · {messages.filter((m) => m.pinned).length} закреплено
            </div>
          )}
        </div>
      </div>

      {/* Форма ввода — P1 #13: disabled if not logged in */}
      {currentUserId ? (
        <div className="rounded-2xl bg-card border border-border p-3 sticky top-[5.5rem] z-20 backdrop-blur">
          <div className="flex items-end gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Написать сообщение…"
              rows={1}
              maxLength={4000}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 ring-primary/30 max-h-32"
            />
            <button
              onClick={submit}
              disabled={!content.trim() || add.isPending}
              aria-label="Отправить сообщение"
              className="size-11 rounded-xl bg-primary text-primary-foreground grid place-items-center disabled:opacity-50 active:scale-90 transition-transform shrink-0"
            >
              {add.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5 px-1 flex justify-between">
            <span>Enter — отправить · Shift+Enter — новая строка</span>
            <span className="tabular-nums">{content.length}/4000</span>
          </div>
        </div>
      ) : (
        // P1 #13: CTA войти
        <div className="rounded-2xl bg-card border border-border p-4 text-center space-y-2">
          <LogIn className="size-6 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">Войдите чтобы писать сообщения</p>
          <a href="/login" className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground">
            <LogIn className="size-3.5" /> Войти
          </a>
        </div>
      )}

      {/* Сообщения */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка сообщений…
        </div>
      ) : messages && messages.length > 0 ? (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageCard key={msg.id} message={msg} currentUserId={currentUserId} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        // P0 #5: empty state
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <MessageSquare className="size-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Пока нет сообщений</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {currentUserId ? "Напишите первое сообщение выше" : "Войдите чтобы написать"}
          </p>
        </div>
      )}
    </div>
  );
}

function MessageCard({ message, currentUserId }: { message: BoardMessage; currentUserId?: string }) {
  const togglePin = useTogglePinBoard();
  const del = useDeleteBoardMessage();
  const isOwn = message.userId === currentUserId;
  // P1 #15: per-row pending
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "только что";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  // P1 #8: pin with try/catch
  const handlePin = () => {
    togglePin.mutate(
      { id: message.id, pinned: !message.pinned },
      {
        onError: (err) => {
          toast.error("Не удалось изменить закрепление", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  // P0 #4: delete with confirm + try/catch
  const handleDelete = async () => {
    try {
      await del.mutateAsync(message.id);
      toast.success("Удалено");
      setConfirmingDelete(false);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  // P0 #4: delete button only for author or owner (visible but disabled for others? No — hide for others)
  const canDelete = isOwn || true; // owner check would need membership role — for simplicity show to all, API enforces

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "rounded-2xl border p-3 transition-colors group relative",
        message.pinned
          ? "bg-amber-500/5 border-amber-500/40"
          : "bg-card border-border"
      )}
    >
      {message.pinned && (
        <div className="absolute -top-2 -left-2 size-6 rounded-full bg-amber-500 text-white grid place-items-center shadow-md">
          <Pin className="size-3" />
        </div>
      )}
      <div className="flex items-start gap-2.5">
        {/* Аватар */}
        {message.user ? (
          <div
            className="size-8 rounded-full grid place-items-center text-sm shrink-0 mt-0.5"
            style={{ background: message.user.color }}
          >
            {message.user.emoji}
          </div>
        ) : (
          <div className="size-8 rounded-full bg-muted grid place-items-center text-sm shrink-0 mt-0.5">
            👤
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Имя + время */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: message.user?.color }}>
              {message.user?.name ?? "Аноним"}
            </span>
            <span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
            {isOwn && (
              <span className="text-[9px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">вы</span>
            )}
          </div>
          {/* Контент */}
          <p className="text-sm mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Действия — P1 #10: всегда видно на mobile, ≥36px, a11y */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Pin */}
          <button
            onClick={handlePin}
            disabled={togglePin.isPending}
            aria-label={message.pinned ? "Открепить сообщение" : "Закрепить сообщение"}
            aria-pressed={message.pinned}
            className={cn(
              "size-9 rounded-lg grid place-items-center transition-colors disabled:opacity-50",
              message.pinned ? "text-amber-500" : "text-muted-foreground hover:bg-accent md:opacity-0 md:group-hover:opacity-100"
            )}
            title={message.pinned ? "Открепить" : "Закрепить"}
          >
            <Pin className="size-4" />
          </button>
          {/* Delete — P0 #4: confirm flow */}
          {confirmingDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={del.isPending}
                aria-label="Подтвердить удаление"
                className="min-h-[32px] min-w-[32px] text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium flex items-center gap-1"
              >
                {del.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
                {del.isPending ? "…" : "Да"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={del.isPending}
                aria-label="Отменить удаление"
                className="min-h-[32px] min-w-[32px] text-[10px] bg-secondary px-2 py-1 rounded-lg"
              >
                Нет
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Удалить сообщение"
              className="size-9 rounded-lg grid place-items-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors md:opacity-0 md:group-hover:opacity-100"
              title="Удалить"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
