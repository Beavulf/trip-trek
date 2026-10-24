"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { isPlausibleEmail, MAX_GUEST_MESSAGE } from "@/lib/feedback";

/**
 * Обращение без входа: забыл пароль, не приходит письмо, не работает код приглашения.
 * Уходит в ту же очередь обратной связи (метка «гость»), ответ — письмом на указанный адрес.
 */
export function GuestContactSheet({
  open,
  onOpenChange,
  initialEmail = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  // Приманка для ботов: человеку поле не видно, его значение сервер молча отбрасывает
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const emailOk = isPlausibleEmail(email);
  const canSend = emailOk && message.trim().length > 0 && !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const r = await fetch("/api/feedback/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), message: message.trim(), website }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((json as { error?: string }).error || "Не удалось отправить");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Нет связи с сервером");
    } finally {
      setSending(false);
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Нужна помощь?" titleIcon={<span>📮</span>}>
      {sent ? (
        <div className="py-6 text-center space-y-4">
          <div className="mx-auto size-16 rounded-full bg-emerald-500/15 grid place-items-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold">Получили, спасибо!</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Ответим на {email.trim()}. Если письма нет — загляните в «Спам».
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold"
          >
            Готово
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Не получается войти, не приходит письмо или не подходит код приглашения? Опишите, что случилось, — ответим на почту.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Ваш email для ответа</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              aria-invalid={!!email && !emailOk}
              className="w-full min-h-12 rounded-2xl border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70 input-mobile"
            />
            {!!email && !emailOk && <span className="text-[11px] text-red-500">Проверьте адрес: похоже на опечатку</span>}
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Что случилось</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_GUEST_MESSAGE}
              rows={5}
              placeholder="Например: «Сбросил пароль, но письмо не пришло»"
              className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm min-h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70 input-mobile"
            />
          </label>
          <input
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute -left-[9999px] size-0 opacity-0"
            name="website"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-45 disabled:pointer-events-none"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Отправляем…" : "Отправить"}
          </button>
        </div>
      )}
    </MobileBottomSheet>
  );
}
