"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Plane, UserPlus, LogIn, Globe, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const EMOJIS = ["🦊", "🐻", "🐼", "🦁", "🐯", "🐨", "🐸", "🐵", "🦉", "🐧", "🦄", "🐲"];
const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => safeCallback(searchParams.get("callbackUrl")), [searchParams]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🦊");
  const [color, setColor] = useState("#f97316");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      toast.error("Заполните все поля");
      return;
    }
    if (mode === "register") {
      if (password.length < 4) {
        toast.error("Пароль минимум 4 символа");
        return;
      }
      if (password !== passwordConfirm) {
        toast.error("Пароли не совпадают");
        return;
      }
    }
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, emoji, color }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }

      // Кастомный логин (обходит баг NextAuth v4 + Turbopack)
      const authRes = await fetch("/api/auth/custom-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const authData = await authRes.json();

      if (!authRes.ok) {
        throw new Error(authData.error || "Неверный email или пароль");
      }

      toast.success(mode === "register" ? "Добро пожаловать! 🎉" : "С возвращением! 👋");
      window.location.assign(callbackUrl);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600 relative overflow-hidden">
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
            <Plane className="size-8" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">TripTrek</h1>
          <p className="text-white/70 text-sm mt-1">
            {mode === "login" ? "Войдите чтобы продолжить" : "Создайте аккаунт"}
          </p>
        </div>

        {/* Карточка формы */}
        <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border">
          {/* Переключатель */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl mb-4">
            <button
              onClick={() => setMode("login")}
              className={`rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                mode === "login" ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <LogIn className="size-4" /> Вход
            </button>
            <button
              onClick={() => setMode("register")}
              className={`rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
                mode === "register" ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}
            >
              <UserPlus className="size-4" /> Регистрация
            </button>
          </div>

          {/* Аватар (только регистрация) */}
          {mode === "register" && (
            <div className="mb-4">
              <div className="flex items-center justify-center mb-2">
                <div
                  className="size-14 rounded-2xl grid place-items-center text-2xl shadow-md transition-all"
                  style={{ background: color }}
                >
                  {emoji}
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-center mb-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`size-7 rounded-lg text-sm grid place-items-center transition-all ${
                      emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 justify-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`size-6 rounded-full transition-all ${
                      color === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Форма */}
          <div className="space-y-3">
            {mode === "register" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Как тебя зовут?"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="••••••"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {mode === "register" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Подтвердите пароль</label>
                <div className="relative">
                  <input
                    type={showPasswordConfirm ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="••••••"
                    className={`w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm ${
                      passwordConfirm && passwordConfirm !== password
                        ? "border-red-500"
                        : passwordConfirm && passwordConfirm === password
                        ? "border-green-500"
                        : "border-input"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswordConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordConfirm && passwordConfirm !== password && (
                  <p className="text-[10px] text-red-500 mt-1">Пароли не совпадают</p>
                )}
                {passwordConfirm && passwordConfirm === password && (
                  <p className="text-[10px] text-green-500 mt-1">✓ Пароли совпадают</p>
                )}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="size-4" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {loading ? "Загрузка…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            {mode === "login"
              ? "Нет аккаунта? Нажми «Регистрация»"
              : "Уже есть аккаунт? Нажми «Вход»"}
          </p>

          {/* Демо-аккаунты */}
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
                  onClick={() => { setEmail(acc.email); setPassword("1234"); setMode("login"); }}
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
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
          <Loader2 className="size-8 text-white animate-spin" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
