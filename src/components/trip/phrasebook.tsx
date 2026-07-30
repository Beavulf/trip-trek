"use client";

import { usePhrases, useTogglePhraseFavorite, type Phrase } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, Search, Star, Volume2, Loader2, ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CATEGORIES: Array<{ key: string; label: string; emoji: string; color: string }> = [
  { key: "all", label: "Все", emoji: "✨", color: "#94a3b8" },
  { key: "basics", label: "Основные", emoji: "💬", color: "#06b6d4" },
  { key: "food", label: "Еда", emoji: "🍜", color: "#f97316" },
  { key: "transport", label: "Транспорт", emoji: "🚇", color: "#0ea5e9" },
  { key: "shopping", label: "Покупки", emoji: "🛍️", color: "#8b5cf6" },
  { key: "emergency", label: "Экстренные", emoji: "🚨", color: "#ef4444" },
  { key: "social", label: "Общение", emoji: "🤝", color: "#10b981" },
];

export function Phrasebook() {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const { data: phrases, isLoading } = usePhrases(category, favOnly);

  const filtered = useMemo(() => {
    if (!phrases) return [];
    if (!query.trim()) return phrases;
    const q = query.toLowerCase();
    return phrases.filter((p) =>
      p.ru.toLowerCase().includes(q) ||
      p.cn.includes(q) ||
      p.pinyin.toLowerCase().includes(q)
    );
  }, [phrases, query]);

  const favCount = phrases?.filter((p) => p.favorite).length ?? 0;

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">🀄</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Languages className="size-4" /> Разговорник
          </div>
          <h1 className="text-2xl font-bold">Полезные фразы</h1>
          <p className="text-white/80 text-sm mt-1">Нажмите 🔊 чтобы услышать произношение</p>
        </div>
      </div>

      {/* Поиск + избранное */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск фразы…"
            className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={() => setFavOnly((v) => !v)}
          className={cn(
            "shrink-0 size-11 rounded-xl grid place-items-center transition-colors border",
            favOnly ? "bg-amber-500 text-white border-amber-500" : "bg-card border-border text-muted-foreground hover:bg-accent"
          )}
          title="Только избранные"
        >
          <Star className={cn("size-5", favOnly && "fill-current")} />
          {favCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-amber-500 text-white text-[9px] font-bold grid place-items-center">
              {favCount}
            </span>
          )}
        </button>
      </div>

      {/* Категории */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                active ? "text-white shadow-md" : "bg-card border border-border hover:bg-accent"
              )}
              style={active ? { background: c.color } : undefined}
            >
              <span>{c.emoji}</span> {c.label}
            </button>
          );
        })}
      </div>

      {/* Список фраз */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка фраз…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {favOnly ? "Нет избранных фраз" : "Ничего не найдено"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((p) => (
              <PhraseCard key={p.id} phrase={p} categoryMeta={CATEGORIES.find((c) => c.key === p.category)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center px-4">
        💡 Произношение через Web Speech API. Для лучшего результата используйте китайское приложение для перевода (Baidu Translate / Pleco).
      </p>
    </div>
  );
}

function PhraseCard({ phrase, categoryMeta }: { phrase: Phrase; categoryMeta?: { color: string; emoji: string } }) {
  const toggle = useTogglePhraseFavorite();
  const [speaking, setSpeaking] = useState(false);

  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Озвучка не поддерживается в этом браузере", {
        description: "Попробуйте Chrome или Safari на телефоне",
      });
      return;
    }

    const synth = window.speechSynthesis;

    // Получаем голоса (могут загружаться асинхронно)
    const getVoices = (): SpeechSynthesisVoice[] => {
      let voices = synth.getVoices();
      return voices;
    };

    let voices = getVoices();

    // Если голоса ещё не загружены — ждём
    if (voices.length === 0) {
      toast.info("Загружаем голоса…", { duration: 1500 });
      // Принудительная загрузка
      synth.getVoices();
      // Ждём 500мс и пробуем снова
      setTimeout(() => {
        voices = synth.getVoices();
        doSpeak(voices);
      }, 500);
      return;
    }

    doSpeak(voices);
  };

  const doSpeak = (voices: SpeechSynthesisVoice[]) => {
    const synth = window.speechSynthesis;

    // Определяем язык фразы по пиньиню/содержимому
    // Если есть китайские иероглифы — zh, японские — ja, корейские — ko, и т.д.
    const text = phrase.cn;
    let langCode = "zh-CN"; // по умолчанию
    let langPrefix = "zh";
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) {
      // Проверяем японские символы (хирагана/катакана)
      if (/[\u3040-\u30ff]/.test(text)) {
        langCode = "ja-JP";
        langPrefix = "ja";
      } else {
        langCode = "zh-CN";
        langPrefix = "zh";
      }
    } else if (/[\uac00-\ud7af]/.test(text)) {
      langCode = "ko-KR";
      langPrefix = "ko";
    } else if (/[\u0e00-\u0e7f]/.test(text)) {
      langCode = "th-TH";
      langPrefix = "th";
    } else if (/[\u0600-\u06ff]/.test(text)) {
      langCode = "ar-SA";
      langPrefix = "ar";
    } else if (/[\u0400-\u04ff]/.test(text)) {
      langCode = "ru-RU";
      langPrefix = "ru";
    } else if (/[àâäçéèêëîïôûùü]/i.test(text)) {
      langCode = "fr-FR";
      langPrefix = "fr";
    } else if (/[äöüß]/i.test(text)) {
      langCode = "de-DE";
      langPrefix = "de";
    } else if (/[ñ¿¡]/i.test(text)) {
      langCode = "es-ES";
      langPrefix = "es";
    }

    // Ищем голос для определённого языка
    const langVoice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
    if (!langVoice) {
      const langNames: Record<string, string> = {
        zh: "китайский",
        ja: "японский",
        ko: "корейский",
        th: "тайский",
        ar: "арабский",
        ru: "русский",
        fr: "французский",
        de: "немецкий",
        es: "испанский",
        en: "английский",
      };
      const langName = langNames[langPrefix] || "язык страны";
      toast.error(`Не установлен ${langName} голос`, {
        description: `Установите ${langName} (${langCode}) голос в настройках TTS телефона, или используйте Google Translate для прослушивания`,
        duration: 6000,
      });
      return;
    }

    synth.cancel();
    const utter = new SpeechSynthesisUtterance(phrase.cn);
    utter.lang = langCode;
    utter.voice = langVoice;
    utter.rate = 0.8;
    utter.pitch = 1;

    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => {
      setSpeaking(false);
      toast.error("Ошибка воспроизведения", {
        description: "Попробуйте Google Translate для прослушивания",
      });
    };

    synth.speak(utter);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="rounded-2xl bg-card border border-border p-4 hover:shadow-md transition-shadow relative overflow-hidden"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: categoryMeta?.color ?? "#94a3b8" }}
      />
      {/* Контент */}
      <div className="ml-1">
        {/* Категория */}
        <span
          className="inline-block text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded mb-2"
          style={{ background: `${categoryMeta?.color}18`, color: categoryMeta?.color }}
        >
          {categoryMeta?.emoji} {CATEGORIES.find((c) => c.key === phrase.category)?.label}
        </span>
        {/* Китайский */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold leading-tight">{phrase.cn}</span>
          <span className="text-sm text-muted-foreground italic">{phrase.pinyin}</span>
        </div>
        {/* Русский */}
        <p className="text-sm text-foreground/80 mt-1">{phrase.ru}</p>
      </div>

      {/* Кнопки — горизонтально внизу */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        {/* Озвучка через TTS телефона */}
        <button
          onClick={speak}
          className={cn(
            "flex-1 h-10 rounded-xl inline-flex items-center justify-center gap-2 px-3 transition-all active:scale-95",
            speaking ? "bg-primary text-primary-foreground animate-pulse" : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
          title="Произнести (TTS телефона)"
        >
          <Volume2 className="size-4 shrink-0" />
          <span className="text-xs font-medium">{speaking ? "Играет…" : "Слушать"}</span>
        </button>
        {/* Google Translate */}
        <a
          href={`https://translate.google.com/?sl=zh-CN&tl=ru&text=${encodeURIComponent(phrase.cn)}&op=translate`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-10 rounded-xl inline-flex items-center justify-center gap-2 px-3 transition-all active:scale-95 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
          title="Google Translate (озвучка + перевод)"
        >
          <ExternalLink className="size-4 shrink-0" />
          <span className="text-xs font-medium">Translate</span>
        </a>
        {/* Избранное */}
        <button
          onClick={() => toggle.mutate({ id: phrase.id, favorite: !phrase.favorite })}
          className={cn(
            "size-10 rounded-xl grid place-items-center transition-all active:scale-90 shrink-0",
            phrase.favorite ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
          title="В избранное"
        >
          <Star className={cn("size-5", phrase.favorite && "fill-current")} />
        </button>
      </div>
    </motion.div>
  );
}
