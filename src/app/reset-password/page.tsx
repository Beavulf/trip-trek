"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, KeyRound, Loader2, Mail, Plane } from "lucide-react";
import { toast } from "sonner";
import { PasswordField } from "@/components/auth/password-field";

// Восстановление доступа, одна страница на оба шага:
//   /reset-password              — нет токена: вводим email, шлём ссылку;
//   /reset-password?token=…      — ссылка из письма: задаём новый пароль.
// Токен в URL одноразовый (60 минут); сообщение про отправку — всегда
// одинаковое, не раскрываем, существует ли такой email.

function checkPassword(p: string): boolean {
  return p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);
}

function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token"), [searchParams]);

  // === Режим «запросить ссылку» ===
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // === Режим «задать новый пароль» ===
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const requestLink = async () => {
    if (sending) return;
    if (!email.trim() || !email.includes("@")) {
      toast.error("Введите email");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось отправить письмо");
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const submitNew = async () => {
    if (saving) return;
    if (!checkPassword(password)) {
      toast.error("Пароль минимум 8 символов, буквы и цифры");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось изменить пароль");
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const title = done
    ? "Пароль изменён"
    : token
    ? "Новый пароль"
    : sent
    ? "Письмо отправлено"
    : "Восстановление доступа";
  const subtitle = token ? "Придумайте пароль и подтвердите его" : "Пришлём ссылку для смены пароля";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600 relative overflow-hidden">
      {/* Декоративные круги */}
      <div className="absolute top-10 left-10 size-32 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute bottom-20 right-10 size-40 rounded-full bg-white/5 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Лого */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="size-16 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-white mx-auto mb-3 shadow-lg"
          >
            {done ? <CheckCircle2 className="size-8" /> : <Plane className="size-8" />}
          </motion.div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-white/70 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border">
          {/* === Новый пароль задан — успех === */}
          {done ? (
            <div className="space-y-4 text-center">
              <div className="size-14 rounded-2xl bg-green-500/10 grid place-items-center mx-auto">
                <CheckCircle2 className="size-7 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                Войдите с новым паролем. Со старых устройств аккаунт выйдет автоматически.
              </p>
              <a
                href="/login"
                className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <KeyRound className="size-4" />
                Войти с новым паролем
              </a>
            </div>
          ) : token ? (
            /* === Есть токен — форма нового пароля === */
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Новый пароль</label>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  autoFocus
                  status={password ? checkPassword(password) : undefined}
                  onKeyDown={(e) => e.key === "Enter" && submitNew()}
                />
                {password && !checkPassword(password) && (
                  <p className="text-[10px] text-amber-500 mt-1">Минимум 8 символов, буквы и цифры</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Подтвердите пароль</label>
                <PasswordField
                  value={passwordConfirm}
                  onChange={setPasswordConfirm}
                  autoComplete="new-password"
                  status={passwordConfirm ? passwordConfirm === password : undefined}
                  onKeyDown={(e) => e.key === "Enter" && submitNew()}
                />
                {passwordConfirm && passwordConfirm !== password && (
                  <p className="text-[10px] text-red-500 mt-1">Пароли не совпадают</p>
                )}
              </div>
              <button
                onClick={submitNew}
                disabled={saving}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {saving ? "Сохраняем…" : "Сохранить пароль"}
              </button>
            </div>
          ) : sent ? (
            /* === Ссылка отправлена === */
            <div className="space-y-4 text-center">
              <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto">
                <Mail className="size-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                Если такой аккаунт существует, мы отправили письмо со ссылкой для смены пароля.
                Она действует 60 минут.
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Не пришло? Проверьте папку «Спам» или попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="w-full min-h-11 rounded-xl bg-secondary border border-border py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Отправить на другой email
              </button>
            </div>
          ) : (
            /* === Запрос ссылки === */
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email аккаунта</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestLink()}
                  placeholder="email@example.com"
                  autoFocus
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <button
                onClick={requestLink}
                disabled={sending}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                {sending ? "Отправляем…" : "Отправить ссылку"}
              </button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            <a href="/login" className="hover:text-foreground transition-colors">
              ← Вернуться ко входу
            </a>
          </p>
        </div>
      </motion.div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
          <Loader2 className="size-8 text-white animate-spin" />
        </div>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}
