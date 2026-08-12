"use client";

import { useAISummary, useTrip } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, Lightbulb, BookHeart, Loader2, RefreshCw, Copy, Check, AlertCircle } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTripId } from "@/hooks/use-trip";
import { currencySymbol } from "@/lib/currencies";

type SummaryType = "summary" | "day" | "tips";

const TYPES: Array<{ key: SummaryType; label: string; desc: string; icon: typeof Sparkles; color: string }> = [
  { key: "summary", label: "Итог поездки", desc: "Красивый отчёт всего путешествия", icon: BookHeart, color: "#f97316" },
  { key: "day", label: "Итог дня", desc: "Атмосферный итог сегодняшнего дня", icon: Calendar, color: "#06b6d4" },
  { key: "tips", label: "Советы", desc: "Практичные советы на оставшуюся поездку", icon: Lightbulb, color: "#8b5cf6" },
];

export function AISummary() {
  const { data: trip, error: tripError } = useTrip();
  const ai = useAISummary();
  const tripId = trip?.settings.tripId || getTripId();
  // P1 #10: сброс content при смене tripId — используем key wrapper компонента.
  // Это правильный React-паттерн: внутренний компонент полностью перемонтируется при смене tripId.
  return <AISummaryInner key={tripId} trip={trip} tripError={tripError} ai={ai} tripId={tripId} />;
}

interface AISummaryInnerProps {
  trip: ReturnType<typeof useTrip>["data"];
  tripError: ReturnType<typeof useTrip>["error"];
  ai: ReturnType<typeof useAISummary>;
  tripId: string;
}

function AISummaryInner({ trip, tripError, ai, tripId }: AISummaryInnerProps) {
  const [activeType, setActiveType] = useState<SummaryType | null>(null);
  const [content, setContent] = useState<string>("");
  const [generated, setGenerated] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  const generate = async (type: SummaryType) => {
    // P1 #5: без tripId — не зовём API
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
      setGenerated(res.generated !== false); // true если реальный AI
    } catch (e) {
      // НЕ сбрасываем activeType — оставляем для error state с кнопкой «Повторить»
      toast.error("Не удалось сгенерировать", {
        description: e instanceof Error ? e.message : "Попробуйте позже",
      });
    }
  };

  // P1 #11: clipboard try/catch (mobile HTTP / permissions)
  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Скопировано в буфер");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback для mobile HTTP где clipboard API может не работать
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

  // P1 #5: нет поездки → empty CTA
  if (tripError || (!trip && !tripId)) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <Hero />
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-4xl">🤔</div>
          <p className="text-sm font-medium">Не выбрана поездка</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Выберите поездку в шапке, чтобы AI мог проанализировать ваши места, записи и траты.
          </p>
        </div>
      </div>
    );
  }

  if (!trip) {
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

      {/* Типы генерации — P1 #5: disabled если нет tripId */}
      <div className="grid sm:grid-cols-3 gap-3">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = activeType === t.key;
          const loading = ai.isPending && active;
          return (
            <button
              key={t.key}
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

      {/* Результат */}
      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={activeType + content.slice(0, 20)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl bg-card border border-border overflow-hidden"
          >
            {/* header результата */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="size-4 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">
                  {TYPES.find((t) => t.key === activeType)?.label}
                </span>
                {/* P1 #12: provenance — бейдж «AI-сгенерировано» только когда реально AI */}
                {generated && (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">· AI-сгенерировано</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* P2 #13: copy/refresh hit ≥44px (size-9 = 36px, min-h-[36px] on wrapper) */}
                <button
                  onClick={copy}
                  aria-label="Копировать текст"
                  className="size-9 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Копировать"
                >
                  {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                </button>
                <button
                  onClick={() => activeType && generate(activeType)}
                  disabled={ai.isPending}
                  aria-label="Обновить генерацию"
                  className="size-9 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Обновить"
                >
                  {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </button>
              </div>
            </div>

            {/* контент */}
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

      {/* Error state (P0 #3 — SDK упал, не маскируем) */}
      {ai.isError && !content && (
        <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4 text-center space-y-2">
          <AlertCircle className="size-8 mx-auto text-red-500" />
          <p className="text-sm font-medium text-red-500">Не удалось сгенерировать</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {ai.error instanceof Error ? ai.error.message : "Попробуйте позже"}
          </p>
          {activeType && (
            <button
              onClick={() => generate(activeType)}
              disabled={ai.isPending}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
            >
              <RefreshCw className="size-3.5" /> Повторить
            </button>
          )}
        </div>
      )}

      {/* Empty state когда ничего не сгенерировано */}
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
            {/* P1 #7: честный copy — photos/captions + journals + members включены в промпт */}
            AI проанализирует дни, места, записи дневника, траты и фото — и создаст красивый текст
          </p>
        </div>
      )}

      {/* Loading state */}
      {ai.isPending && !content && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Нейросеть анализирует вашу поездку…
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

      {/* Подсказка — P1 #8: валюта из trip.settings.currency; P2 #19: spent без settlement */}
      {trip && content && (
        <p className="text-xs text-muted-foreground text-center px-4">
          ✨ Сгенерировано на основе {trip.visitedPlaces} посещённых мест, {trip.totalPhotos} фото, {trip.totalJournals} записей и {sym}{trip.totalSpent.toFixed(0)} трат
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
          Нейросеть создаст красивые итоги вашей поездки
          {tripTitle && <span className="text-white/60"> · {tripTitle}</span>}
        </p>
      </div>
    </div>
  );
}
