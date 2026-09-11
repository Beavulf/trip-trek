"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { useTripStore } from "@/lib/trip-store";

type FeedbackType = "bug" | "idea" | "question";

const TYPES: { value: FeedbackType; emoji: string; label: string; hint: string }[] = [
  { value: "bug", emoji: "🐞", label: "Баг", hint: "что-то сломалось" },
  { value: "idea", emoji: "💡", label: "Идея", hint: "что улучшить" },
  { value: "question", emoji: "❓", label: "Вопрос", hint: "что непонятно" },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый", cls: "text-amber-500 border-amber-500/40" },
  in_progress: { label: "В работе", cls: "text-sky-500 border-sky-500/40" },
  resolved: { label: "Решён", cls: "text-emerald-500 border-emerald-500/40" },
};

interface MyFeedback {
  id: string;
  type: FeedbackType;
  message: string;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** Форма баг-репорта/идеи/вопроса + список своих обращений с ответами админа. */
export function BugReportSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: session } = useAuth();
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTripId = useTripStore((s) => s.currentTripId);

  // Мои обращения: статусы и ответы админа
  const { data: mine } = useQuery<MyFeedback[]>({
    queryKey: ["feedback-mine"],
    queryFn: async () => {
      const r = await fetch("/api/feedback/mine");
      if (!r.ok) throw new Error("fetch mine failed");
      return r.json();
    },
    enabled: open && !!session?.user,
    staleTime: 30_000,
  });

  // Превью скриншота + очистка object URL
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setType("bug");
    setMessage("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("message", message);
      fd.append("type", type);
      // Автоконтекст: откуда отправили и в какой поездке
      fd.append("pageUrl", window.location.pathname + window.location.search);
      if (currentTripId) fd.append("tripId", currentTripId);
      if (file) fd.append("file", file);

      const r = await fetch("/api/feedback", { method: "POST", body: fd });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(json.error || "Не удалось отправить");
        return;
      }
      toast.success("Спасибо! Разберёмся 🙏");
      handleClose(false);
    } catch {
      toast.error("Нет связи с сервером");
    } finally {
      setSending(false);
    }
  };

  const activeType = TYPES.find((t) => t.value === type)!;

  return (
    <MobileBottomSheet open={open} onOpenChange={handleClose} title="Сообщить о проблеме" titleIcon={<span>📮</span>}>
      <div className="space-y-4">
        {/* Тип обращения */}
        <div>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                aria-pressed={type === t.value}
                className={cn(
                  "flex flex-col items-center gap-0.5 min-h-16 rounded-xl text-xs font-semibold transition-all",
                  type === t.value ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-lg leading-none mt-1.5">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 px-1">{activeType.hint}</p>
        </div>

        {/* Текст */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder={
            type === "bug"
              ? "Что случилось? Что нажимал, что ожидал, что получилось"
              : type === "idea"
                ? "Расскажи, чего не хватает"
                : "Спрашивай — ответим"
          }
          className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm min-h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
        />

        {/* Скриншот */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
        {preview ? (
          <div className="relative rounded-2xl overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Скриншот" className="w-full max-h-44 object-cover" />
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Убрать скриншот"
              className="absolute top-2 right-2 size-8 rounded-full bg-black/60 text-white grid place-items-center backdrop-blur"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-14 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Paperclip className="size-4" />
            Прикрепить скриншот
          </button>
        )}

        {/* Что уйдёт вместе с сообщением */}
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate">
          отправится: {typeof window !== "undefined" ? window.location.pathname + window.location.search : "…"}
          {currentTripId ? " · поездка приложена" : ""}
        </p>

        {/* Отправить */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!message.trim() || sending}
          className={cn(
            "w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
            (!message.trim() || sending) && "opacity-50 pointer-events-none"
          )}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Отправить
        </button>

        {/* Мои обращения: статус + ответ админа */}
        {mine && mine.length > 0 && (
          <div className="pt-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">
              мои обращения
            </p>
            <div className="space-y-2">
              {mine.map((f) => {
                const st = STATUS_LABEL[f.status] || STATUS_LABEL.new;
                const t = TYPES.find((x) => x.value === f.type) || TYPES[0];
                return (
                  <div key={f.id} className="rounded-2xl border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.emoji}</span>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest",
                          st.cls
                        )}
                      >
                        {st.label}
                      </span>
                      <span className="flex-1" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        {new Date(f.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{f.message}</p>
                    {f.adminReply && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2 mt-1">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          ответ админа
                        </p>
                        <p className="text-xs mt-0.5 whitespace-pre-wrap">{f.adminReply}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}
