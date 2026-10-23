"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeInviteCode } from "@/lib/split/invite";
import { useAuth } from "@/hooks/use-auth";
import { fetchJoinPreview, useJoinGroup } from "@/hooks/split/use-split";
import { MemberAvatar } from "@/components/split/ui";

// Приглашение в группу «Сочтёмся»: превью без входа → вход/регистрация → «Это я» для заведённых заранее
// участников без аккаунта → вступление. Отдельно от /join поездок: там обложка и маршрут, здесь — люди и валюта.

function JoinContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = normalizeInviteCode(params.get("code") ?? "");
  const autoJoin = params.get("join") === "1";
  const { data: session, status } = useAuth();
  const join = useJoinGroup();
  // undefined — ещё не выбирал; "new" — «я новый участник»; иначе id строки без аккаунта
  const [choice, setChoice] = useState<string | undefined>(undefined);

  const preview = useQuery({
    queryKey: ["split", "join-preview", code],
    queryFn: () => fetchJoinPreview(code),
    enabled: code.length >= 4,
    retry: false,
  });

  const doJoin = async (claimMemberId?: string) => {
    try {
      const res = await join.mutateAsync({ code, claimMemberId });
      toast.success(res.alreadyMember ? "Ты уже в этой группе 👋" : "Добро пожаловать в группу! 🎉");
      router.replace(`/split/${res.groupId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось вступить");
    }
  };

  // Возврат из логина: людей для «Это я» нет — вступаем за друга сразу; иначе он выбирает сам (ошибка необратима)
  const tried = useRef(false);
  useEffect(() => {
    if (!autoJoin || tried.current || status !== "authenticated" || !preview.data) return;
    if (preview.data.claimable.length > 0) return;
    tried.current = true;
    void doJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- одноразовый автозапуск
  }, [autoJoin, status, preview.data]);

  const p = preview.data;
  const returnTo = `/split/join?code=${encodeURIComponent(code)}&join=1`;
  const loginUrl = (mode: "login" | "register") => `/login?callbackUrl=${encodeURIComponent(returnTo)}&mode=${mode}`;
  const needsChoice = !!p && p.claimable.length > 0;
  const canJoin = !join.isPending && (!needsChoice || choice !== undefined);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 relative overflow-hidden">
      <div className="absolute top-10 left-10 size-32 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute bottom-20 right-10 size-40 rounded-full bg-white/5 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative z-10">
        <div className="text-center mb-5 text-white">
          <div className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center mx-auto mb-3 text-2xl font-bold shadow-lg" aria-hidden>
            ₽
          </div>
          <h1 className="text-2xl font-bold">Сочтёмся</h1>
          <p className="text-white/80 text-sm">общие траты с друзьями</p>
        </div>

        <div className="rounded-3xl bg-card text-card-foreground shadow-2xl p-5">
          {code.length < 4 ? (
            <div className="text-center space-y-3 py-4">
              <p className="font-semibold">Нет кода приглашения</p>
              <p className="text-sm text-muted-foreground">Открой ссылку, которую прислал друг, или введи код на странице «Сочтёмся».</p>
              <Link href="/split" className="inline-flex min-h-11 items-center px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                К моим группам
              </Link>
            </div>
          ) : preview.isLoading ? (
            <div className="py-10 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" aria-label="Загрузка" />
            </div>
          ) : preview.isError || !p ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl" aria-hidden>
                🤔
              </div>
              <p className="font-semibold">Группа не найдена</p>
              <p className="text-sm text-muted-foreground">{preview.error instanceof Error ? preview.error.message : "Проверь код или попроси новую ссылку."}</p>
              <Link href="/split" className="inline-flex min-h-11 items-center px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                К моим группам
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-grid size-16 place-items-center rounded-2xl text-3xl" style={{ background: `${p.color}26` }} aria-hidden>
                  {p.emoji}
                </span>
                <h2 className="mt-2 text-lg font-bold">{p.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {p.members.length} в группе · валюта {p.currency}
                </p>
                <div className="flex justify-center gap-1 mt-2 flex-wrap">
                  {p.members.slice(0, 8).map((m, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full pl-1 pr-2 py-0.5">
                      <MemberAvatar member={m} className="size-5" /> {m.name}
                    </span>
                  ))}
                </div>
              </div>

              {status === "loading" ? (
                <div className="py-2 grid place-items-center">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              ) : status === "unauthenticated" || !session?.user ? (
                <div className="space-y-2">
                  <Link href={loginUrl("register")} className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                    <UserPlus className="size-4" /> Создать аккаунт и вступить
                  </Link>
                  <Link href={loginUrl("login")} className="w-full min-h-12 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2 hover:bg-accent active:scale-[0.98] transition-[transform,background-color]">
                    <LogIn className="size-4" /> У меня уже есть аккаунт
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {needsChoice && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium mb-1">Кто ты в этой группе?</legend>
                      {p.claimable.map((c) => (
                        <label key={c.id} className={cn("flex items-center gap-3 rounded-xl border px-3 min-h-14 cursor-pointer transition-colors", choice === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50")}>
                          <input type="radio" name="who" className="sr-only" checked={choice === c.id} onChange={() => setChoice(c.id)} />
                          <MemberAvatar member={c} className="size-9" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate">Это я — {c.name}</span>
                            <span className="block text-[11px] text-muted-foreground">его траты и долги достанутся тебе</span>
                          </span>
                          {choice === c.id && <Check className="size-4 text-primary" />}
                        </label>
                      ))}
                      <label className={cn("flex items-center gap-3 rounded-xl border px-3 min-h-14 cursor-pointer transition-colors", choice === "new" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50")}>
                        <input type="radio" name="who" className="sr-only" checked={choice === "new"} onChange={() => setChoice("new")} />
                        <span className="size-9 rounded-full bg-muted grid place-items-center text-lg" aria-hidden>
                          ✨
                        </span>
                        <span className="flex-1 text-sm font-medium">Я новый участник</span>
                        {choice === "new" && <Check className="size-4 text-primary" />}
                      </label>
                    </fieldset>
                  )}
                  <button
                    type="button"
                    onClick={() => doJoin(choice && choice !== "new" ? choice : undefined)}
                    disabled={!canJoin}
                    className={cn("w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-[transform,opacity]", !canJoin && "opacity-50")}
                  >
                    {join.isPending && <Loader2 className="size-4 animate-spin" />} Вступить в группу
                  </button>
                  <p className="text-[11px] text-center text-muted-foreground">
                    {choice && choice !== "new"
                      ? `Ты станешь «${p.claimable.find((c) => c.id === choice)?.name ?? ""}»: вся история достанется тебе. Имя можно поменять внутри группы.`
                      : `Ты вступишь как ${session.user.name}. Имя и значок можно поменять внутри группы.`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function SplitJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh grid place-items-center bg-gradient-to-br from-emerald-500 to-teal-600">
          <Loader2 className="size-7 animate-spin text-white/80" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
