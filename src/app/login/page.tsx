"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Plane, UserPlus, LogIn } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      toast.error("Заполните все поля");
      return;
    }
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Неверный email или пароль");
      }

      toast.success(mode === "register" ? "Регистрация успешна! 🎉" : "С возвращением! 👋");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Лого */}
        <div className="text-center mb-6">
          <div className="size-16 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-white mx-auto mb-3 shadow-lg">
            <Plane className="size-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">TripTrek China</h1>
          <p className="text-white/70 text-sm mt-1">Войдите чтобы продолжить</p>
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
            </div>

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
        </div>
      </motion.div>
    </div>
  );
}
