"use client";

import { useAISummary, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, Lightbulb, BookHeart, Loader2, RefreshCw, Copy, Check, AlertCircle } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";

type SummaryType = "summary" | "day" | "tips";

const TYPES: Array<{ key: SummaryType; label: string; desc: string; icon: typeof Sparkles; color: string }> = [
  { key: "summary", label: "Итог поездки", desc: "Красивый отчёт всего путешествия", icon: BookHeart, color: "#f97316" },
  { key: "day", label: "Итог дня", desc: "Атмосферный итог сегодняшнего дня", icon: Calendar, color: "#06b6d4" },
  { key: "tips", label: "Советы", desc: "Практичные советы на оставшуюся поездку", icon: Lightbulb, color: "#8b5cf6" },
];

export function AISummary() {
  const tripId = useCurrentTripId();
  // key сбрасывает локальный state + mutation при смене поездки
  return <AISummaryInner key={tripId || "none"} tripId={tripId} />;
}

function AISummaryInner({ tripId }: { tripId: string }) {
  const { data: trip, error: tripError, isLoading, refetch } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();
  const ai = useAISummary();
  const [activeType, setActiveType] = useState<SummaryType | null>(null);
  const [content, setContent] = useState<string>("");
  const [generated, setGenerated] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  const generate = async (type: SummaryType) => {
    if (!tripId) {
      toast.error("Не выбрана поездка");
      return;
    }
    setActiveType(type);
    setContent("");
    setGenerated(false);
    try {
      const res = await ai.mutateAsync({ type });
      setContent(res.content);
      setGenerated(res.generated !== false);
    } catch (e) {
      toast.error("Не удалось сгенерировать", {
        description: e instanceof Error ? e.message : "Попробуйте позже",
      });
    }
  };

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Скопировано в буфер");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        toast.success("Скопировано в буфер");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Не удалось скопировать", { description: "Скопируйте текст вручную" });
      }
    }
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <Hero />
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-4xl">🤔</div>
          <p className="text-sm font-medium">Не выбрана поездка</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Выберите поездку, чтобы собрать итог по местам, записям и тратам.
          </p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <Hero />
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-4xl">🤔</div>
          <p className="text-sm font-medium">Не удалось загрузить поездку</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !trip) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  const sym = currencySymbol(trip.settings.currency);

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <Hero tripTitle={trip.settings.title} />

      <div className="grid sm:grid-cols-3 gap-3">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = activeType === t.key;
          const loading = ai.isPending && active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => generate(t.key)}
              disabled={ai.isPending}
              aria-label={`Сгенерировать: ${t.label}`}
              className={cn(
                "relative min-h-[88px] rounded-2xl border-2 p-4 text-left transition-all overflow-hidden group disabled:opacity-60",
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:shadow-md"
              )}
            >
              {active && (
                <div
                  className="absolute inset-0 opacity-5"
                  style={{ background: `radial-gradient(circle at top right, ${t.color}, transparent 70%)` }}
                />
              )}
              <div className="relative flex items-start gap-3">
                <div
                  className="size-10 rounded-xl grid place-items-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={activeType + content.slice(0, 20)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl bg-card border border-border overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="size-4 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">
                  {TYPES.find((t) => t.key === activeType)?.label}
                </span>
                {generated ? (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">· AI</span>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">· черновик</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Копировать текст"
                  className="size-11 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Копировать"
                >
                  {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => activeType && generate(activeType)}
                  disabled={ai.isPending}
                  aria-label="Обновить генерацию"
                  className="size-11 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Обновить"
                >
                  {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:leading-relaxed prose-p:my-2
              prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2
              prose-strong:font-semibold
              prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
              prose-blockquote:border-l-primary prose-blockquote:not-italic prose-blockquote:text-muted-foreground
            ">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {ai.isError && !content && (
        <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4 text-center space-y-2">
          <AlertCircle className="size-8 mx-auto text-red-500" />
          <p className="text-sm font-medium text-red-500">Не удалось сгенерировать</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {ai.error instanceof Error ? ai.error.message : "Попробуйте позже"}
          </p>
          {activeType && (
            <button
              type="button"
              onClick={() => generate(activeType)}
              disabled={ai.isPending}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 min-h-11 rounded-lg bg-primary text-primary-foreground"
            >
              <RefreshCw className="size-3.5" /> Повторить
            </button>
          )}
        </div>
      )}

      {!content && !ai.isPending && !ai.isError && (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="text-5xl mb-3"
          >
            🪄
          </motion.div>
          <p className="text-sm font-medium">Выберите тип итога выше</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Соберём текст по дням, местам, дневнику и тратам. Если AI недоступен — будет локальный черновик.
          </p>
        </div>
      )}

      {ai.isPending && !content && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Собираем итог поездки…
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="h-3 bg-muted rounded"
                style={{ width: `${100 - i * 15}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {trip && content && (
        <p className="text-xs text-muted-foreground text-center px-4">
          ✨ На основе {trip.visitedPlaces} посещённых мест, {trip.totalPhotos} фото, {trip.totalJournals} записей и {sym}{trip.totalSpent.toFixed(0)} трат
          {!generated ? " · локальный черновик" : ""}
        </p>
      )}
    </div>
  );
}

function Hero({ tripTitle }: { tripTitle?: string }) {
  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-500 text-white shadow-xl relative overflow-hidden">
      <div className="absolute -bottom-8 -right-4 text-[120px] opacity-15 select-none leading-none">✨</div>
      <div className="relative">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Sparkles className="size-4" /> AI-Итоги
        </div>
        <h1 className="text-2xl font-bold">Магия воспоминаний</h1>
        <p className="text-white/80 text-sm mt-1">
          Красивые итоги поездки по вашим данным
          {tripTitle && <span className="text-white/60"> · {tripTitle}</span>}
        </p>
      </div>
    </div>
  );
}
