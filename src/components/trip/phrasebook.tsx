"use client";

import { usePhrases, useTogglePhraseFavorite, useGeneratePhrases, type Phrase } from "@/hooks/use-trip";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, Search, Star, Volume2, Loader2, ExternalLink, Download, Sparkles } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { detectLanguage, googleTranslateUrl } from "@/lib/language-detect";
import { useTripStore } from "@/lib/trip-store";

const CATEGORIES: Array<{ key: string; label: string; emoji: string; color: string }> = [
  { key: "all", label: "Все", emoji: "✨", color: "#94a3b8" },
  { key: "basics", label: "Основные", emoji: "💬", color: "#06b6d4" },
  { key: "food", label: "Еда", emoji: "🍜", color: "#f97316" },
  { key: "transport", label: "Транспорт", emoji: "🚇", color: "#0ea5e9" },
  { key: "shopping", label: "Покупки", emoji: "🛍️", color: "#8b5cf6" },
  { key: "emergency", label: "Экстренные", emoji: "🚨", color: "#ef4444" },
  { key: "social", label: "Общение", emoji: "🤝", color: "#10b981" },
];

// Языки для generate (доступны в API)
const LANGUAGES: Array<{ code: string; label: string; emoji: string }> = [
  { code: "zh", label: "Китайский", emoji: "🇨🇳" },
  { code: "ja", label: "Японский", emoji: "🇯🇵" },
  { code: "ko", label: "Корейский", emoji: "🇰🇷" },
  { code: "th", label: "Тайский", emoji: "🇹🇭" },
  { code: "vi", label: "Вьетнамский", emoji: "🇻🇳" },
  { code: "fr", label: "Французский", emoji: "🇫🇷" },
  { code: "de", label: "Немецкий", emoji: "🇩🇪" },
  { code: "es", label: "Испанский", emoji: "🇪🇸" },
  { code: "en", label: "Английский", emoji: "🇬🇧" },
];

export function Phrasebook() {
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen } = useTripStore();
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const { data: phrases, isLoading, error: phrasesError, refetch: refetchPhrases } = usePhrases(category, favOnly);
  const { data: allPhrases } = usePhrases("all", false);
  const generate = useGeneratePhrases();
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedLang, setSelectedLang] = useState("en");

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

  const favCount = allPhrases?.filter((p) => p.favorite).length ?? 0;
  const totalCount = allPhrases?.length ?? 0;
  const listCount = phrases?.length ?? 0;

  // P0 #3: generate с try/catch + toast
  const handleGenerate = async () => {
    if (!tripId) {
      toast.error("Не выбрана поездка");
      return;
    }
    try {
      const result = await generate.mutateAsync({ tripId, language: selectedLang });
      if (result.created === 0) {
        toast.info("Фразы уже существуют", { description: `Всего: ${result.total}` });
      } else {
        toast.success(`Создано ${result.created} фраз`, {
          description: LANGUAGES.find((l) => l.code === selectedLang)?.label,
        });
      }
      setShowGenerate(false);
    } catch (err) {
      toast.error("Не удалось загрузить фразы", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">💬</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }
  if (phrasesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">💬</div>
        <p className="text-sm font-medium">Не удалось загрузить фразы</p>
        <button
          type="button"
          onClick={() => refetchPhrases()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading && !phrases) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Загрузка фраз…
      </div>
    );
  }

  // P1 #11: нейтральный hero (не 🀄 если не китай)
  // Определяем основной язык пакета по первой фразе
  const primaryLang = allPhrases && allPhrases.length > 0 ? detectLanguage(allPhrases[0].cn) : null;
  const isChinese = primaryLang?.langPrefix === "zh";
  const heroEmoji = isChinese ? "🀄" : primaryLang ? getLangEmoji(primaryLang.langPrefix) : "💬";

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-4 text-[120px] opacity-15 select-none leading-none">{heroEmoji}</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Languages className="size-4" /> Разговорник
          </div>
          <h1 className="text-2xl font-bold">Полезные фразы</h1>
          <p className="text-white/80 text-sm mt-1">
            Нажмите 🔊 чтобы услышать произношение
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
          {/* P2 #15: hero metrics */}
          {totalCount > 0 && (
            <div className="flex gap-4 mt-3">
              <div>
                <div className="text-2xl font-bold tabular-nums">{totalCount}</div>
                <div className="text-xs text-white/70">фраз</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{favCount}</div>
                <div className="text-xs text-white/70">избранных</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* P1 #7: честный copy про избранное */}
      {totalCount > 0 && (
        <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          ⭐ Избранное — общее для всей компании в этой поездке
        </p>
      )}

      {/* Поиск + избранное */}
      {totalCount > 0 && (
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
            aria-label={favOnly ? "Показать все фразы" : "Только избранные"}
            aria-pressed={favOnly}
            className={cn(
              "shrink-0 size-11 rounded-xl grid place-items-center transition-colors border relative",
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
      )}

      {/* Категории */}
      {totalCount > 0 && (
        <div className="chip-rail no-scrollbar">
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                aria-label={`Категория: ${c.label}`}
                aria-pressed={active}
                className={cn(
                  "min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                  active ? "text-white shadow-md" : "bg-card border border-border hover:bg-accent"
                )}
                style={active ? { background: c.color } : undefined}
              >
                <span>{c.emoji}</span> {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Список фраз */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка фраз…
        </div>
      ) : totalCount === 0 ? (
        // P0 #3: empty — нет фраз → CTA «загрузить пакет»
        <GenerateEmpty
          showGenerate={showGenerate}
          setShowGenerate={setShowGenerate}
          selectedLang={selectedLang}
          setSelectedLang={setSelectedLang}
          onGenerate={handleGenerate}
          isGenerating={generate.isPending}
        />
      ) : filtered.length === 0 ? (
        // P0 #1: empty при поиске/фильтре
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
          <div className="text-3xl">🔍</div>
          <p className="text-sm text-muted-foreground">
            {favOnly ? "Нет избранных фраз" : "Ничего не найдено"}
          </p>
          {(query || favOnly || category !== "all") && (
            <button
              onClick={() => { setQuery(""); setFavOnly(false); setCategory("all"); }}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
            >
              Сбросить фильтр
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((p) => (
              <PhraseCard key={p.id} phrase={p} categoryMeta={CATEGORIES.find((c) => c.key === p.category)} isChinese={isChinese} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* P1 #11: нейтральная подпись (не Baidu/Pleco всегда) */}
      <p className="text-[11px] text-muted-foreground text-center px-4">
        💡 Произношение через Web Speech API. Для лучшего результата используйте Google Translate.
      </p>
    </div>
  );
}

function getLangEmoji(prefix: string): string {
  const map: Record<string, string> = {
    zh: "🀄", ja: "🎌", ko: "🇰🇷", th: "🇹🇭", vi: "🇻🇳",
    fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", en: "🇬🇧", ar: "🇸🇦", ru: "🇷🇺",
  };
  return map[prefix] || "💬";
}

// P0 #3: empty state с generate
function GenerateEmpty({
  showGenerate,
  setShowGenerate,
  selectedLang,
  setSelectedLang,
  onGenerate,
  isGenerating,
}: {
  showGenerate: boolean;
  setShowGenerate: (v: boolean) => void;
  selectedLang: string;
  setSelectedLang: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  if (!showGenerate) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-2">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="text-5xl mb-2"
        >
          💬
        </motion.div>
        <p className="text-sm font-medium">Пока нет фраз</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Загрузите разговорник для языка вашей поездки — приветствия, еда, транспорт, экстренные фразы
        </p>
        <button
          onClick={() => setShowGenerate(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
        >
          <Download className="size-3.5" /> Загрузить разговорник
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">Выберите язык</h2>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setSelectedLang(l.code)}
            aria-label={`Язык: ${l.label}`}
            aria-pressed={selectedLang === l.code}
            className={cn(
              "min-h-[44px] flex flex-col items-center gap-0.5 p-2 rounded-xl border-2 transition-all",
              selectedLang === l.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            )}
          >
            <span className="text-xl">{l.emoji}</span>
            <span className="text-[10px] font-medium">{l.label}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowGenerate(false)}
          disabled={isGenerating}
          className="flex-1 min-h-[44px] rounded-lg bg-secondary py-2.5 text-sm font-medium"
        >
          Отмена
        </button>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex-1 min-h-[44px] rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isGenerating ? "Загрузка…" : "Загрузить"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Создаст ~10-30 фраз для языка. Можно дополнить вручную позже.
      </p>
    </div>
  );
}

function PhraseCard({ phrase, categoryMeta, isChinese }: { phrase: Phrase; categoryMeta?: { color: string; emoji: string }; isChinese?: boolean }) {
  const toggle = useTogglePhraseFavorite();
  const [speaking, setSpeaking] = useState(false);

  // P1 #6: speech с shared detectLanguage (не дефолт zh-CN для латиницы)
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Озвучка не поддерживается в этом браузере", {
        description: "Попробуйте Chrome или Safari на телефоне",
      });
      return;
    }

    const synth = window.speechSynthesis;
    let voices = synth.getVoices();

    const doSpeak = (voiceList: SpeechSynthesisVoice[]) => {
      // P1 #6: shared detectLanguage — не дефолт zh-CN
      const lang = detectLanguage(phrase.cn);

      // Ищем голос для определённого языка
      const langVoice = voiceList.find((v) => v.lang.toLowerCase().startsWith(lang.langPrefix));
      if (!langVoice) {
        // P1 #6: fallback — для латиницы пробуем en, потом любой
        let fallback = voiceList.find((v) => v.lang.toLowerCase().startsWith("en"));
        if (!fallback) {
          toast.error(`Не установлен ${lang.langName} голос`, {
            description: `Установите ${lang.langName} (${lang.langCode}) голос в настройках TTS, или используйте Google Translate`,
            duration: 6000,
          });
          return;
        }
        // Используем en fallback
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(phrase.cn);
        utter.lang = "en-US";
        utter.voice = fallback;
        utter.rate = 0.8;
        utter.onstart = () => setSpeaking(true);
        utter.onend = () => setSpeaking(false);
        utter.onerror = () => {
          setSpeaking(false);
          toast.error("Ошибка воспроизведения", { description: "Попробуйте Google Translate" });
        };
        synth.speak(utter);
        toast.info("Используем английский голос", { description: `${lang.langName} голос не установлен` });
        return;
      }

      synth.cancel();
      const utter = new SpeechSynthesisUtterance(phrase.cn);
      utter.lang = lang.langCode;
      utter.voice = langVoice;
      utter.rate = 0.8;
      utter.pitch = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => {
        setSpeaking(false);
        toast.error("Ошибка воспроизведения", { description: "Попробуйте Google Translate" });
      };
      synth.speak(utter);
    };

    // Если голоса ещё не загружены — ждём
    if (voices.length === 0) {
      toast.info("Загружаем голоса…", { duration: 1500 });
      synth.getVoices();
      setTimeout(() => {
        voices = synth.getVoices();
        doSpeak(voices);
      }, 500);
      return;
    }

    doSpeak(voices);
  };

  // P1 #8: toggle с try/catch
  const handleToggle = () => {
    toggle.mutate(
      { id: phrase.id, favorite: !phrase.favorite },
      {
        onError: (err) => {
          toast.error("Не удалось обновить избранное", {
            description: err instanceof Error ? err.message : "Попробуйте ещё раз",
          });
        },
      }
    );
  };

  // P1 #11: нейтральные подписи если не китай
  const lang = detectLanguage(phrase.cn);
  const phraseLabel = isChinese ? phrase.cn : phrase.cn;
  const pronunciationLabel = lang.langPrefix === "zh" ? "Пиньинь" : lang.langPrefix === "ja" ? "Ромадзи" : "Произношение";

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
        {/* Фраза (P1 #11: не "Китайский" если не zh) */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold leading-tight">{phraseLabel}</span>
          <span className="text-sm text-muted-foreground italic">{phrase.pinyin}</span>
        </div>
        {/* Русский */}
        <p className="text-sm text-foreground/80 mt-1">{phrase.ru}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{pronunciationLabel}</p>
      </div>

      {/* Кнопки — горизонтально внизу */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        {/* Озвучка через TTS телефона */}
        <button
          onClick={speak}
          disabled={speaking}
          aria-label={speaking ? "Остановить воспроизведение" : "Произнести фразу"}
          className={cn(
            "flex-1 min-h-11 rounded-xl inline-flex items-center justify-center gap-2 px-3 transition-all active:scale-95 disabled:opacity-50",
            speaking ? "bg-primary text-primary-foreground animate-pulse" : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
          title="Произнести (TTS телефона)"
        >
          <Volume2 className="size-4 shrink-0" />
          <span className="text-xs font-medium">{speaking ? "Играет…" : "Слушать"}</span>
        </button>
        {/* P1 #5: Google Translate sl из detectLanguage (не хардкод zh-CN) */}
        <a
          href={googleTranslateUrl(phrase.cn)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть в Google Translate"
          className="flex-1 min-h-11 rounded-xl inline-flex items-center justify-center gap-2 px-3 transition-all active:scale-95 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
          title="Google Translate (озвучка + перевод)"
        >
          <ExternalLink className="size-4 shrink-0" />
          <span className="text-xs font-medium">Translate</span>
        </a>
        {/* Избранное */}
        <button
          onClick={handleToggle}
          disabled={toggle.isPending}
          aria-label={phrase.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          aria-pressed={phrase.favorite}
          className={cn(
            "min-h-11 size-11 rounded-xl grid place-items-center transition-all active:scale-90 shrink-0 disabled:opacity-50",
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
