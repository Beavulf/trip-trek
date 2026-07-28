"use client";

import { useBoard, useAddBoardMessage, useTogglePinBoard, useDeleteBoardMessage, useTrip, type BoardMessage } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, Pin, Trash2, Loader2, MessagesSquare } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Board() {
  const { data: messages, isLoading } = useBoard();
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const add = useAddBoardMessage();
  const [content, setContent] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentUserId = (session?.user as { id?: string } | undefined)?.id || trip?.settings.currentUserId || "";

  const submit = () => {
    if (!content.trim()) return;
    add.mutate({ content: content.trim(), userId: currentUserId });
    setContent("");
    toast.success("Сообщение отправлено 💬");
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
          </p>
          {messages && messages.length > 0 && (
            <div className="text-xs text-white/70 mt-2">
              {messages.length} сообщений · {messages.filter((m) => m.pinned).length} закреплено
            </div>
          )}
        </div>
      </div>

      {/* Форма ввода */}
      <div className="rounded-2xl bg-card border border-border p-3 sticky top-[7.5rem] z-20 backdrop-blur">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
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
            className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 ring-primary/30 max-h-32"
          />
          <button
            onClick={submit}
            disabled={!content.trim() || add.isPending}
            className="size-11 rounded-xl bg-primary text-primary-foreground grid place-items-center disabled:opacity-50 active:scale-90 transition-transform shrink-0"
          >
            {add.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5 px-1">
          Enter — отправить · Shift+Enter — новая строка
        </div>
      </div>

      {/* Сообщения */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка сообщений…
        </div>
      ) : messages && messages.length > 0 ? (
        <div ref={listRef} className="space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageCard key={msg.id} message={msg} currentUserId={currentUserId} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <MessageSquare className="size-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Пока нет сообщений</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Напишите первое сообщение выше</p>
        </div>
      )}
    </div>
  );
}

function MessageCard({ message, currentUserId }: { message: BoardMessage; currentUserId?: string }) {
  const togglePin = useTogglePinBoard();
  const del = useDeleteBoardMessage();
  const isOwn = message.userId === currentUserId;

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "только что";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

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

        {/* Действия */}
        <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => togglePin.mutate({ id: message.id, pinned: !message.pinned })}
            className={cn(
              "size-7 rounded-md grid place-items-center transition-colors",
              message.pinned ? "text-amber-500" : "text-muted-foreground hover:bg-accent"
            )}
            title={message.pinned ? "Открепить" : "Закрепить"}
          >
            <Pin className="size-3.5" />
          </button>
          <button
            onClick={() => { del.mutate(message.id); toast.success("Удалено"); }}
            className="size-7 rounded-md grid place-items-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Удалить"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
