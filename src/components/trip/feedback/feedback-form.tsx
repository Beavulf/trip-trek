"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useSendFeedback } from "@/hooks/use-feedback";
import { useTripStore } from "@/lib/trip-store";
import { readDraft } from "@/lib/form-draft";
import { compressImageForUpload, ImageCompressError } from "@/lib/image-compress";
import {
  describeScreen,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_META,
  MAX_MESSAGE,
  screenFromLocation,
  type FeedbackType,
} from "@/lib/feedback";
import { MonoLabel } from "./feedback-bits";

interface Draft {
  type: FeedbackType;
  message: string;
}

const isDraftEmpty = (d: Draft) => !d.message.trim();

/** Форма нового обращения. Черновик переживает закрытие окна; после отправки — экран «спасибо». */
export function FeedbackForm({ onOpenThread, onDone }: { onOpenThread: (id: string) => void; onDone: () => void }) {
  const { data: session } = useAuth();
  const userId = (session?.user as { id?: string } | undefined)?.id || "anon";
  const draftStorageKey = `tt-draft:feedback:${userId}`;
  const currentTripId = useTripStore((s) => s.currentTripId);
  const activeTab = useTripStore((s) => s.activeTab);
  const send = useSendFeedback();

  // Вернуть набранное, если окно закрыли случайно; форма монтируется уже после клика, SSR нет
  const [restored] = useState(() => readDraft<Draft>(draftStorageKey));
  const [type, setType] = useState<FeedbackType>(restored?.type ?? "bug");
  const [message, setMessage] = useState(restored?.message ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [attach, setAttach] = useState(true);
  const [sentId, setSentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const draftValue = useMemo<Draft>(() => ({ type, message }), [type, message]);
  const { discard } = useFormDraft(draftStorageKey, draftValue, isDraftEmpty);

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

  const pickFile = useCallback(async (raw: File | null | undefined) => {
    if (!raw) return;
    setPreparing(true);
    try {
      // Скриншоты с телефонов легко весят больше лимита сервера (5 МБ) — сжимаем до отправки
      setFile(await compressImageForUpload(raw, { maxSide: 1800, quality: 0.82, maxBytes: 4 * 1024 * 1024 }));
    } catch (e) {
      toast.error(e instanceof ImageCompressError ? e.message : "Не удалось подготовить картинку");
    } finally {
      setPreparing(false);
    }
  }, []);

  const meta = FEEDBACK_TYPE_META[type];
  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && !send.isPending && !preparing;

  const screen = typeof window !== "undefined" ? screenFromLocation(window.location.pathname, activeTab) : null;
  const where = describeScreen(screen);

  const submit = async () => {
    if (!canSend) return;
    const fd = new FormData();
    fd.append("message", trimmed);
    fd.append("type", type);
    if (attach) {
      if (screen) fd.append("screen", screen);
      if (currentTripId) fd.append("tripId", currentTripId);
      fd.append("viewport", `${window.innerWidth}x${window.innerHeight}${window.matchMedia("(display-mode: standalone)").matches ? " pwa" : ""}`);
      fd.append("appVersion", process.env.NEXT_PUBLIC_APP_VERSION || "");
    } else {
      fd.append("noContext", "1");
    }
    if (file) fd.append("file", file);
    try {
      const res = await send.mutateAsync(fd);
      discard();
      setMessage("");
      setFile(null);
      setSentId(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Нет связи с сервером");
    }
  };

  if (sentId) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="mx-auto size-16 rounded-full bg-emerald-500/15 grid place-items-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold">Спасибо, получили!</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Ответ придёт в колокольчик 🔔 и появится здесь, в «Моих обращениях». Дописать можно в любой момент.
          </p>
        </div>
        <div className="grid gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenThread(sentId)}
            className="min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold active:scale-[0.98] transition-transform"
          >
            Открыть обращение
          </button>
          <button
            type="button"
            onClick={onDone}
            className="min-h-11 rounded-2xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Тип обращения */}
      <div>
        <div role="radiogroup" aria-label="Тип обращения" className="grid grid-cols-5 gap-1 p-1 rounded-2xl bg-muted">
          {FEEDBACK_TYPES.map((t) => {
            const m = FEEDBACK_TYPE_META[t];
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setType(t);
                  textareaRef.current?.focus({ preventScroll: true });
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-h-16 rounded-xl text-[11px] font-semibold transition-all",
                  active ? "bg-card shadow-sm text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-xl leading-none">{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2 px-1">{meta.hint}</p>
      </div>

      {/* Текст */}
      <div>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onPaste={(e) => {
            // Вставка скриншота из буфера (на ПК: Win+Shift+S → Ctrl+V)
            const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (img) {
              e.preventDefault();
              void pickFile(img);
            }
          }}
          maxLength={MAX_MESSAGE}
          rows={5}
          placeholder={meta.placeholder}
          aria-label="Текст обращения"
          className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm min-h-32 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70 input-mobile"
        />
        {message.length > MAX_MESSAGE * 0.8 && (
          <p className="text-right text-[11px] text-muted-foreground mt-1">
            {message.length} / {MAX_MESSAGE}
          </p>
        )}
      </div>

      {/* Скриншот */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden border border-border bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Приложенный скриншот" className="w-full max-h-44 object-contain" />
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Убрать скриншот"
            className="absolute top-2 right-2 size-9 rounded-full bg-black/65 text-white grid place-items-center backdrop-blur"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={preparing}
          className="w-full min-h-12 rounded-2xl border border-dashed border-border hover:border-primary/50 hover:bg-accent/40 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground disabled:opacity-60"
        >
          {preparing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {preparing ? "Готовим картинку…" : "Приложить скриншот"}
        </button>
      )}

      {/* Что уйдёт вместе с сообщением */}
      <div className="rounded-2xl bg-muted/50 px-3.5 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">Приложить сведения для разбора</p>
          <MonoLabel className="mt-1 normal-case tracking-normal font-sans text-[11px] leading-snug">
            {attach
              ? `${where ?? "Экран"} · устройство и размер окна${currentTripId ? " · текущая поездка" : ""}. Это помогает быстрее найти причину.`
              : "Уйдут только текст и скриншот."}
          </MonoLabel>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={attach}
          aria-label="Приложить сведения для разбора"
          onClick={() => setAttach((v) => !v)}
          className={cn(
            "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
            attach ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
              attach && "translate-x-5"
            )}
          />
        </button>
      </div>

      {/* Отправить: прилипает к низу окна, чтобы не уезжать за длинным текстом */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-3 bg-gradient-to-t from-card from-70% to-transparent">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none"
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {send.isPending ? "Отправляем…" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
