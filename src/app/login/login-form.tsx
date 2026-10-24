"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, UserPlus, LogIn } from "lucide-react";
import { toast } from "sonner";
import { PasswordField } from "@/components/auth/password-field";
import { contactLink } from "@/app/landing/showcase";
import { AVATAR_COLORS, AVATAR_EMOJIS, pickRandom } from "@/lib/avatar-presets";
import { isInviteError, serverErrorText, validateAuthForm } from "@/lib/auth-form";
import { reachGoal } from "@/lib/metrika";
import { PASSWORD_HINT, validatePasswordPolicy } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

// Вход и регистрация. Режим приложения (закрыта ли регистрация, нужен ли инвайт-код)
// приходит с сервера пропсами из page.tsx: форма не делает лишнего запроса и сразу
// рисует поле кода. Ошибки — строкой под кнопкой (тост пропадает за пару секунд, а ошибки
// кода — самые частые); тост только для успеха.

// 16px: меньший шрифт заставляет iOS приближать страницу при фокусе в поле
const inputCls = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile";
const labelCls = "text-xs text-muted-foreground mb-1 block";

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export interface LoginFormProps {
  registrationEnabled: boolean;
  /** null — режим прочитать не удалось (БД не ответила): поле кода показываем как необязательное */
  inviteRequired: boolean | null;
  contactTelegram: string | null;
}

export function LoginForm({ registrationEnabled, inviteRequired, contactTelegram }: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => safeCallback(searchParams.get("callbackUrl")), [searchParams]);
  // ?mode=register — со страницы приглашения: друг без аккаунта сразу попадает в форму регистрации.
  // ?code=… — инвайт-код приложения из ссылки (описание видео): подставляем в поле и открываем регистрацию
  const urlCode = (searchParams.get("code") ?? "").trim().slice(0, 32);
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" || urlCode ? "register" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(urlCode);
  // null = «случайный»: значок не выбран руками, при отправке подставится случайный из списка
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Сервер потребовал код, хотя при загрузке страницы режим был другим (админ включил гейт) — показываем поле
  const [serverWantsInvite, setServerWantsInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registering = mode === "register";
  const closed = registering && !registrationEnabled;
  const codeRequired: boolean | null = serverWantsInvite ? true : inviteRequired;
  const showInvite = registering && !closed && (codeRequired !== false);
  const passwordProblem = password ? validatePasswordPolicy(password) : null;
  const contact = contactLink(contactTelegram);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    setError(null);

    const problem = validateAuthForm({ mode, name, email, password, invite, inviteRequired: codeRequired });
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    try {
      if (registering) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            name: name.trim(),
            emoji: emoji ?? pickRandom(AVATAR_EMOJIS),
            color: color ?? pickRandom(AVATAR_COLORS),
            inviteCode: invite.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = serverErrorText(res.status, data);
          if (isInviteError(msg)) setServerWantsInvite(true);
          setError(msg);
          return;
        }
      }

      // Кастомный логин (обходит баг NextAuth v4 + Turbopack)
      const authRes = await fetch("/api/auth/custom-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const authData = await authRes.json().catch(() => null);
      if (!authRes.ok) {
        const msg = serverErrorText(authRes.status, authData);
        if (registering) {
          // Аккаунт уже создан: не пугаем «неверным паролем», отправляем на вкладку входа с готовым email
          setMode("login");
          setError(`Аккаунт создан, но войти сразу не получилось: ${msg} Нажмите «Войти», чтобы продолжить.`);
        } else {
          setError(msg);
        }
        return;
      }

      toast.success(registering ? "Добро пожаловать! 🎉" : "С возвращением! 👋");
      // Цель регистрации уходит до перехода: иначе загрузка новой страницы обрывает запрос в Метрику
      if (registering) reachGoal("signup", () => window.location.assign(callbackUrl));
      else window.location.assign(callbackUrl);
    } catch {
      // fetch бросает только при обрыве связи; ошибки сервера разобраны выше
      setError("Нет связи с сервером. Проверьте интернет и повторите.");
    } finally {
      setLoading(false);
    }
  };

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
            className="mx-auto mb-3 w-fit"
          >
            {/* Фирменный знак (PNG уже со скруглёнными углами); тень повторяет радиус через rounded-2xl */}
            <img src="/icon-192.png" alt="Логотип TripTrek" className="size-16 rounded-2xl shadow-lg" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">TripTrek</h1>
          <p className="text-white/70 text-sm mt-1">
            {registering ? "Создайте аккаунт" : "Войдите, чтобы продолжить"}
          </p>
        </div>

        {/* Карточка формы */}
        <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border">
          {/* Переключатель */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl mb-4">
            <button
              type="button"
              aria-pressed={!registering}
              onClick={() => switchMode("login")}
              className={`rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                !registering ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <LogIn className="size-4" /> Вход
            </button>
            <button
              type="button"
              aria-pressed={registering}
              onClick={() => switchMode("register")}
              className={`rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                registering ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <UserPlus className="size-4" /> Регистрация
            </button>
          </div>

          {closed ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2" role="status">
              <p className="text-sm font-medium">Регистрация сейчас закрыта</p>
              <p className="text-xs text-muted-foreground">
                Новые аккаунты мы пока не принимаем. Если аккаунт у вас уже есть, войдите.
              </p>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Перейти ко входу
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-3">
              {/* Значок профиля (только регистрация): по умолчанию случайный, выбор спрятан */}
              {registering && (
                <div className="rounded-xl bg-muted/60 p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-10 shrink-0 rounded-xl grid place-items-center text-xl shadow-sm"
                      style={{ background: color ?? "#94a3b8" }}
                      aria-hidden="true"
                    >
                      {emoji ?? "🎲"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Значок профиля</p>
                      <p className="text-[11px] text-muted-foreground">
                        {emoji || color ? "Выбран вами" : "Случайный, поменять можно потом"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-expanded={avatarOpen}
                      onClick={() => setAvatarOpen((v) => !v)}
                      className="text-xs font-medium text-primary hover:underline px-2 py-2"
                    >
                      {avatarOpen ? "Свернуть" : "Изменить"}
                    </button>
                  </div>
                  {avatarOpen && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {AVATAR_EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            aria-label={`Значок ${e}`}
                            aria-pressed={emoji === e}
                            onClick={() => setEmoji(e)}
                            className={`size-9 rounded-lg text-base grid place-items-center transition-all ${
                              emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-background hover:bg-accent"
                            }`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1.5 justify-center">
                        {AVATAR_COLORS.map((c, i) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Цвет ${i + 1}`}
                            aria-pressed={color === c}
                            onClick={() => setColor(c)}
                            className={`size-7 rounded-full transition-all ${
                              color === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                            }`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {registering && (
                <div>
                  <label htmlFor="auth-name" className={labelCls}>
                    Имя
                  </label>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как вас зовут?"
                    autoComplete="name"
                    autoCapitalize="words"
                    className={inputCls}
                  />
                </div>
              )}

              {showInvite && (
                <div>
                  <label htmlFor="auth-invite" className={labelCls}>
                    {codeRequired === null ? "Инвайт-код, если он у вас есть" : "Инвайт-код"}
                  </label>
                  <input
                    id="auth-invite"
                    name="invite"
                    type="text"
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="Из описания видео или от друга"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`${inputCls} uppercase`}
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className={labelCls}>
                  Email
                </label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="auth-password" className={labelCls}>
                  Пароль
                </label>
                <PasswordField
                  id="auth-password"
                  name="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={registering ? "new-password" : "current-password"}
                  status={registering && password ? !passwordProblem : undefined}
                  describedBy={registering ? "auth-password-hint" : undefined}
                />
                {registering && (
                  <p
                    id="auth-password-hint"
                    className={cn(
                      "text-[11px] mt-1",
                      !password ? "text-muted-foreground" : passwordProblem ? "text-red-500" : "text-green-500"
                    )}
                  >
                    {password && !passwordProblem ? "✓ Пароль подходит" : PASSWORD_HINT}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : registering ? (
                  <UserPlus className="size-4" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {loading ? "Загрузка…" : registering ? "Зарегистрироваться" : "Войти"}
              </button>

              {error && (
                <p role="alert" className="text-xs text-red-500 text-center leading-snug">
                  {error}
                </p>
              )}

              {registering && (
                <p className="text-[11px] text-muted-foreground text-center leading-snug">
                  Регистрируясь, вы соглашаетесь с{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    условиями и политикой конфиденциальности
                  </a>
                </p>
              )}

              {!registering && (
                <a
                  href="/reset-password"
                  className="block w-full text-center text-xs text-muted-foreground hover:text-primary py-1 transition-colors"
                >
                  Забыли пароль?
                </a>
              )}
            </form>
          )}

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            {registering ? "Уже есть аккаунт? Нажмите «Вход»" : "Нет аккаунта? Нажмите «Регистрация»"}
          </p>

          {contact && (
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Застряли? Напишите нам:{" "}
              <a href={contact.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {contact.label}
              </a>
            </p>
          )}

          {/* Демо-аккаунты — только в dev: в проде известных логинов быть не должно */}
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center mb-2">Демо-аккаунты:</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: "Ты", email: "you@triptrek.com", emoji: "🦊", color: "#f97316" },
                  { name: "Лёха", email: "leha@triptrek.com", emoji: "🐻", color: "#06b6d4" },
                  { name: "Дэн", email: "den@triptrek.com", emoji: "🐼", color: "#8b5cf6" },
                ].map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword("1234");
                      switchMode("login");
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="size-8 rounded-full grid place-items-center text-sm" style={{ background: acc.color }}>
                      {acc.emoji}
                    </div>
                    <span className="text-[10px] font-medium">{acc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </main>
  );
}
