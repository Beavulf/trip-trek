"use client";

// «Фразы» — карманный разговорник поездки.
// Тап по фразе → крупный экран «покажи местному», 🔊 — голос телефона,
// ⋯ — копировать/перевести/править. Плюс флешкарт-тренажёр и свои фразы.

import { useMemo, useState } from "react";
import { usePhrases, useTogglePhraseFavorite, useGeneratePhrases, useAiGenerate, useDeletePhraseGroup, useTrip, useCurrentTripId, type Phrase } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import {
  Languages,
  Search,
  Star,
  Volume2,
  Loader2,
  Download,
  Plus,
  GraduationCap,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { detectLanguage } from "@/lib/language-detect";
import { useTripStore } from "@/lib/trip-store";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { ShowCard } from "./phrases/ShowCard";
import { TrainerSheet } from "./phrases/TrainerSheet";
import { PhraseActionsSheet } from "./phrases/PhraseActionsSheet";
import { AddPhraseSheet } from "./phrases/AddPhraseSheet";
import { BROWSE_CATEGORIES, CATEGORIES, LANGUAGES, categoryMeta, codeFromLangName, langBadge, pronunciationLabel } from "./phrases/constants";
import { speakPhrase, stripDiacritics } from "./phrases/shared";

export function Phrasebook() {
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const tripId = useCurrentTripId();
  const { setTripSwitcherOpen } = useTripStore();
  const { data: phrases, isLoading, error: phrasesError, refetch: refetchPhrases } = usePhrases();
  const generate = useGeneratePhrases();
  const ai = useAiGenerate();
  const toggle = useTogglePhraseFavorite();

  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [showIndex, setShowIndex] = useState<number | null>(null);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [actionsId, setActionsId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState("en");
  // Какой язык показывать: "all" — все языки вперемешку
  const [langFilter, setLangFilter] = useState("all");

  const totalCount = phrases?.length ?? 0;
  const favCount = phrases?.filter((p) => p.favorite).length ?? 0;

  // Язык пакета — по первой фразе (для обложки и подписей)
  const coverPhrase = useMemo(
    () => phrases?.find((p) => p.category === "basics") ?? phrases?.[0],
    [phrases]
  );
  const lang = coverPhrase ? detectLanguage(coverPhrase.cn) : null;
  const langName = lang ? lang.langName.charAt(0).toUpperCase() + lang.langName.slice(1) : null;

  // Угадываем язык набора по направлению поездки — стартовый выбор в шторке загрузки
  const guessLang = useMemo(() => {
    const d = (trip?.trip?.destination || "").toLowerCase();
    const table: Array<[RegExp, string]> = [
      [/китай|china/, "zh"],
      [/япон|japan/, "ja"],
      [/корей|korea/, "ko"],
      [/таил|тайв|thai|taiwan/, "th"],
      [/вьет|viet/, "vi"],
      [/франц|franc/, "fr"],
      [/герман|german/, "de"],
      [/испан|spain/, "es"],
    ];
    for (const [re, code] of table) if (re.test(d)) return code;
    return "en";
  }, [trip]);

  // Язык пакета для ИИ-действий: по фразам, фолбэк — направление поездки
  const packLanguage = lang?.langPrefix ?? guessLang;
  const packLangName = langName ?? LANGUAGES.find((l) => l.code === guessLang)?.label;
  const multiLang = useMemo(
    () => new Set((phrases ?? []).map((p) => p.language).filter(Boolean)).size >= 2,
    [phrases]
  );

  // «Ещё фразы раздела» — ИИ дописывает разговорник в поездке
  const handleMorePhrases = async () => {
    if (!tripId) return;
    try {
      const r = await ai.mutateAsync({ tripId, mode: "more", language: packLanguage, languageName: packLangName, category, count: 8 });
      toast.success(`ИИ добавил ${r.created} ${plural(r.created, "фразу", "фразы", "фраз")}`);
    } catch (err) {
      toast.error("ИИ не смог добавить фразы", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const searching = query.trim() !== "";
  const filtered = useMemo(() => {
    if (!phrases) return [];
    let list = phrases;
    if (langFilter !== "all") list = list.filter((p) => (p.language || "") === langFilter);
    if (favOnly) list = list.filter((p) => p.favorite);
    const q = query.trim();
    if (q) {
      // поиск идёт по всем разделам, без привязки к чипу
      const nq = stripDiacritics(q);
      list = list.filter(
        (p) =>
          p.ru.toLowerCase().includes(nq) ||
          p.cn.toLowerCase().includes(nq) ||
          stripDiacritics(p.pinyin).includes(nq)
      );
    } else if (category !== "all") {
      list = list.filter((p) => p.category === category);
    }
    return list;
  }, [phrases, langFilter, favOnly, query, category]);

  // В режиме «Все» без поиска — лента, сгруппированная по разделам
  const groups = useMemo(() => {
    if (searching || category !== "all") return null;
    return BROWSE_CATEGORIES.map((meta) => ({
      meta,
      items: filtered.filter((p) => p.category === meta.key),
    })).filter((g) => g.items.length > 0);
  }, [filtered, searching, category]);

  const countFor = (key: string) => {
    if (!phrases) return 0;
    // счётчики разделов — в рамках выбранного языка, как и список ниже
    let base = langFilter === "all" ? phrases : phrases.filter((p) => (p.language || "") === langFilter);
    if (favOnly) base = base.filter((p) => p.favorite);
    return key === "all" ? base.length : base.filter((p) => p.category === key).length;
  };

  // Языки в разговорнике с количеством фраз: это и фильтр «какой язык показать»,
  // и список «Уже загружены» в шторке «Загрузить набор»
  const langOptions = useMemo(() => {
    const counts = new Map<string, number>();
    (phrases ?? []).forEach((p) => {
      const code = p.language || "";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [phrases]);
  const packs = langOptions;
  const showLangRail = langOptions.length >= 2;
  const langLabel = (code: string) =>
    code === "" ? "Без языка" : LANGUAGES.find((l) => l.code === code)?.label ?? code;
  const activeLangName = langFilter === "all" ? null : langLabel(langFilter);

  const hasFilters = searching || favOnly || category !== "all" || langFilter !== "all";
  const actionsPhrase = phrases?.find((p) => p.id === actionsId) ?? null;

  const handleGenerate = async () => {
    if (!tripId) return;
    try {
      const result = await generate.mutateAsync({ tripId, language: selectedLang });
      if (result.created === 0) {
        toast.info(result.message || "Фразы уже существуют", { description: `Всего: ${result.total}` });
      } else {
        toast.success(`Создано ${result.created} ${plural(result.created, "фраза", "фразы", "фраз")}`, {
          description: LANGUAGES.find((l) => l.code === selectedLang)?.label,
        });
      }
      setGenerateOpen(false);
    } catch (err) {
      toast.error("Не удалось загрузить фразы", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-sky-500 p-5 text-center text-white shadow-xl">
          <div className="mb-3 text-5xl">💬</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="mt-1 text-sm text-white/80">Создай или выбери поездку</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 min-h-11 rounded-xl bg-white/20 px-4 py-3 text-sm font-medium backdrop-blur active:scale-95"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (phrasesError) {
    return (
      <div className="space-y-2 py-16 text-center text-muted-foreground">
        <div className="text-3xl">💬</div>
        <p className="text-sm font-medium">Не удалось загрузить фразы</p>
        <button
          type="button"
          onClick={() => refetchPhrases()}
          className="mt-2 min-h-11 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading && !phrases) {
    return <PhraseSkeleton />;
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Обложка разговорника */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 p-5 text-white shadow-xl">
        {coverPhrase && (
          <div className="absolute -bottom-8 -right-2 -rotate-6 select-none text-[110px] font-bold leading-none opacity-20">
            {coverPhrase.cn}
          </div>
        )}
        <div className="relative">
          <div className="mb-1 flex items-center gap-2 text-sm text-white/80">
            <Languages className="size-4" />
            {multiLang
              ? `Разговорник · ${langOptions.length} ${plural(langOptions.length, "язык", "языка", "языков")}`
              : `Разговорник${langName ? ` · ${langName}` : ""}`}
          </div>
          {totalCount > 0 ? (
            <>
              <h1 className="text-2xl font-bold">
                {activeLangName
                  ? `${activeLangName.charAt(0).toUpperCase()}${activeLangName.slice(1)} в дорогу`
                  : lang?.langPrefix === "zh"
                    ? "Китайский в дорогу"
                    : `${langName ?? "Фразы"} в дорогу`}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                Тапни по фразе — покажем крупно · 🔊 озвучит вслух
              </p>
              <div className="mt-3 flex gap-4">
                <div>
                  <div className="text-2xl font-bold tabular-nums">{totalCount}</div>
                  <div className="text-xs text-white/70">{plural(totalCount, "фраза", "фразы", "фраз")}</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">{favCount}</div>
                  <div className="text-xs text-white/70">избранных</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (filtered.length === 0) {
                      toast.info("Сначала сбрось фильтры — тренируем то, что на экране");
                      return;
                    }
                    setTrainerOpen(true);
                  }}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur active:scale-95"
                >
                  <GraduationCap className="size-4" /> Тренажёр
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur active:scale-95"
                >
                  <Plus className="size-4" /> Своя фраза
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLang(guessLang);
                    setGenerateOpen(true);
                  }}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur active:scale-95"
                  title="Добавить набор для другого языка"
                >
                  <Download className="size-4" /> Ещё язык
                </button>
              </div>
              {/* Подсказка «зачем и как»: фича загрузки языка неочевидна, пока не откроешь шторку */}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-white/75">
                <span aria-hidden>💡</span>
                <span>
                  «Ещё язык» скачивает набор фраз для другой страны: один раз онлайн — дальше офлайн, чтобы показать или послушать фразу на месте.
                </span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Пустой разговорник</h1>
              <p className="mt-1 text-sm text-white/80">
                Загрузи готовый набор для языка поездки — основы, еда, транспорт, экстренные
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLang(guessLang);
                    setGenerateOpen(true);
                  }}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-white text-indigo-700 px-4 py-2.5 text-sm font-bold active:scale-95"
                >
                  <Download className="size-4" /> Загрузить набор
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur active:scale-95"
                >
                  <Plus className="size-4" /> Своя фраза
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {totalCount > 0 && (
        <>
          {/* Поиск + только избранные */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по всем разделам…"
                className="w-full rounded-xl border border-input bg-card py-2.5 pl-9 pr-3 text-base sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setFavOnly((v) => !v)}
              aria-label={favOnly ? "Показать все фразы" : "Только избранные"}
              aria-pressed={favOnly}
              className={cn(
                "relative grid size-11 shrink-0 place-items-center rounded-xl border transition-colors",
                favOnly
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              )}
              title="Только избранные"
            >
              <Star className={cn("size-5", favOnly && "fill-current")} />
              {favCount > 0 && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {favCount}
                </span>
              )}
            </button>
          </div>

          {/* Языки: выбор «что показывать сейчас» — появляется, когда язык не один */}
          {showLangRail && (
            <>
              <div className="chip-rail no-scrollbar">
                <button
                  type="button"
                  onClick={() => setLangFilter("all")}
                  aria-label="Показать все языки"
                  aria-pressed={langFilter === "all"}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    langFilter === "all" ? "bg-primary text-white shadow-md" : "border border-border bg-card hover:bg-accent"
                  )}
                >
                  Все языки
                  <span className={cn("tabular-nums", langFilter === "all" ? "text-white/75" : "text-muted-foreground/70")}>
                    {phrases?.length ?? 0}
                  </span>
                </button>
                {langOptions.map(({ code, count }) => {
                  const active = langFilter === code;
                  return (
                    <button
                      key={code || "none"}
                      type="button"
                      onClick={() => setLangFilter(code)}
                      aria-label={`Показать только: ${langLabel(code)}`}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                        active ? "bg-primary text-white shadow-md" : "border border-border bg-card hover:bg-accent"
                      )}
                    >
                      <span aria-hidden>{langBadge(code) ?? "💬"}</span> {langLabel(code)}
                      <span className={cn("tabular-nums", active ? "text-white/75" : "text-muted-foreground/70")}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="-mt-2 px-1 text-[11px] text-muted-foreground">
                Выбери язык — в списке останется только он. Подгрузить ещё: «Ещё язык» ↑
              </p>
            </>
          )}

          {/* Разделы — скрываем в режиме поиска */}
          {!searching && (
            <div className="chip-rail no-scrollbar">
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                const count = countFor(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-label={`Раздел: ${c.label}`}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      active ? "text-white shadow-md" : "border border-border bg-card hover:bg-accent"
                    )}
                    style={active ? { background: c.color } : undefined}
                  >
                    <span>{c.emoji}</span> {c.label}
                    <span className={cn("tabular-nums", active ? "text-white/75" : "text-muted-foreground/70")}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Список */}
      {totalCount === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium">Набор ещё не загружен</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            Готовый набор — быстрый старт. Свои фразы можно добавлять в любой момент.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedLang(guessLang);
              setGenerateOpen(true);
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground"
          >
            <Download className="size-3.5" /> Выбрать язык
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <div className="text-3xl">{favOnly && !searching ? "⭐" : "🔍"}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {searching
              ? "Ничего не найдено"
              : favOnly
                ? "Нет избранных фраз — жми ⭐ на карточке"
                : "В этом разделе пусто"}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFavOnly(false);
                setCategory("all");
                setLangFilter("all");
              }}
              className="mt-3 min-h-11 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {searching && (
            <p className="text-[11px] text-muted-foreground px-1">
              Ищем по всем разделам · найдено {filtered.length} {plural(filtered.length, "фраза", "фразы", "фраз")}
            </p>
          )}
          {groups ? (
            groups.map((g) => (
              <div key={g.meta.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: g.meta.color }}>
                    {g.meta.emoji} {g.meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{g.items.length}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {g.items.map((p) => (
                    <PhraseCard
                      key={p.id}
                      phrase={p}
                      index={filtered.indexOf(p)}
                      onShow={setShowIndex}
                      onActions={setActionsId}
                      toggle={toggle}
                      showLang={multiLang && langFilter === "all"}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map((p, i) => (
                  <PhraseCard
                    key={p.id}
                    phrase={p}
                    index={i}
                    onShow={setShowIndex}
                    onActions={setActionsId}
                    toggle={toggle}
                    showLang={multiLang && langFilter === "all"}
                  />
                ))}
              </AnimatePresence>
              {/* Дописать раздел через ИИ — сценарий «уже в стране, нужны ещё фразы» */}
              {!searching && category !== "all" && (
                <button
                  type="button"
                  onClick={handleMorePhrases}
                  disabled={ai.isPending}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  {ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-indigo-500" />}
                  {ai.isPending ? "ИИ сочиняет…" : `Ещё фразы раздела через ИИ${packLangName ? ` · ${packLangName.toLowerCase()}` : ""}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <p className="px-4 text-center text-[11px] text-muted-foreground">
        ⭐ и фразы общие для всей компании · 🔊 — голос телефона, нет голоса — «Перевод» в ⋯
      </p>

      {/* Оверлеи */}
      {showIndex !== null && filtered.length > 0 && (
        <ShowCard
          phrases={filtered}
          index={Math.min(showIndex, filtered.length - 1)}
          onIndexChange={setShowIndex}
          onClose={() => setShowIndex(null)}
        />
      )}
      <TrainerSheet open={trainerOpen} onOpenChange={setTrainerOpen} pool={filtered} />
      <PhraseActionsSheet phrase={actionsPhrase} onOpenChange={(v) => !v && setActionsId(null)} onShowBig={(p) => setShowIndex(filtered.findIndex((f) => f.id === p.id))} />
      <AddPhraseSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        tripId={tripId}
        defaultCategory={category !== "all" ? category : "basics"}
        language={packLanguage}
        languageName={packLangName}
      />
      <GenerateSheet
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        tripId={tripId}
        selectedLang={selectedLang}
        setSelectedLang={setSelectedLang}
        onGenerate={handleGenerate}
        isGenerating={generate.isPending}
        packs={packs}
      />
    </div>
  );
}

/* Шторка загрузки набора: 9 языков офлайн-паками + любой язык через ИИ + удаление паков */
function GenerateSheet({
  open,
  onOpenChange,
  tripId,
  selectedLang,
  setSelectedLang,
  onGenerate,
  isGenerating,
  packs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tripId: string;
  selectedLang: string;
  setSelectedLang: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  packs: { code: string; count: number }[];
}) {
  const ai = useAiGenerate();
  const deleteGroup = useDeletePhraseGroup();
  const [aiLang, setAiLang] = useState("");
  const [confirmLang, setConfirmLang] = useState<string | null>(null);

  const packLabel = (code: string) => {
    if (!code) return "Без языка (старые наборы)";
    return LANGUAGES.find((l) => l.code === code)?.label ?? code;
  };

  const handleDeleteGroup = async (code: string) => {
    try {
      const r = await deleteGroup.mutateAsync({ tripId, language: code });
      toast.success(`Удалено ${r.deleted} ${plural(r.deleted, "фраза", "фразы", "фраз")}`, {
        description: packLabel(code),
      });
      setConfirmLang(null);
    } catch (err) {
      toast.error("Не удалось удалить набор", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleAiPack = async () => {
    const name = aiLang.trim();
    if (!name || !tripId) return;
    const { code } = codeFromLangName(name);
    try {
      const r = await ai.mutateAsync({ tripId, mode: "pack", language: code, languageName: name, count: 24 });
      toast.success(`ИИ собрал ${r.created} ${plural(r.created, "фразу", "фразы", "фраз")} — «${name}»`);
      onOpenChange(false);
    } catch (err) {
      toast.error("ИИ не смог собрать набор", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmLang(null);
        onOpenChange(v);
      }}
      title="Загрузить набор"
      titleIcon={<Download className="size-5 text-primary" />}
    >
      <div className="space-y-3">
        {/* Загруженные паки — можно удалить группой целиком */}
        {packs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Уже загружены:</p>
            {packs.map(({ code, count }) => (
              <div key={code || "none"} className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">
                  {packLabel(code)} <span className="text-xs text-muted-foreground tabular-nums">· {count} {plural(count, "фраза", "фразы", "фраз")}</span>
                </span>
                {confirmLang === code ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(code)}
                      disabled={deleteGroup.isPending}
                      className="min-h-9 rounded-lg bg-red-500 px-3 text-xs font-medium text-white active:scale-95 disabled:opacity-50"
                    >
                      {deleteGroup.isPending ? "…" : "Удалить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLang(null)}
                      className="min-h-9 rounded-lg bg-secondary px-3 text-xs"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmLang(code)}
                    aria-label={`Удалить набор: ${packLabel(code)}`}
                    title="Удалить набор целиком"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 active:scale-90"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Готовые наборы — мгновенно и работают офлайн: приветствия, еда, транспорт, покупки, экстренные.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setSelectedLang(l.code)}
              aria-label={`Язык: ${l.label}`}
              aria-pressed={selectedLang === l.code}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-2 transition-all active:scale-95",
                selectedLang === l.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              )}
            >
              <span className="text-xl">{l.emoji}</span>
              <span className="text-[10px] font-medium">{l.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isGenerating ? "Загружаем…" : `Загрузить ${LANGUAGES.find((l) => l.code === selectedLang)?.label ?? ""}`}
        </button>

        {/* Любой язык, которого нет в паках, — собирает ИИ */}
        <div className="space-y-2 border-t border-border pt-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ai-lang">
            Нет в списке? Любой язык соберёт ИИ ✨
          </label>
          <div className="flex gap-2">
            <input
              id="ai-lang"
              value={aiLang}
              onChange={(e) => setAiLang(e.target.value)}
              maxLength={30}
              placeholder="Например: грузинский"
              className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-2.5 text-base"
            />
            <button
              type="button"
              onClick={handleAiPack}
              disabled={!aiLang.trim() || ai.isPending}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white active:scale-95 transition-transform disabled:opacity-40"
            >
              {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {ai.isPending ? "Сочиняем…" : "Собрать"}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ~24 фразы по всем разделам. Нужен интернет — потом фразы работают офлайн.
          </p>
        </div>
      </div>
    </MobileBottomSheet>
  );
}

/* Карточка фразы: тап по контенту — показать крупно, снизу — быстрые действия */
function PhraseCard({
  phrase,
  index,
  onShow,
  onActions,
  toggle,
  showLang,
}: {
  phrase: Phrase;
  index: number;
  onShow: (i: number) => void;
  onActions: (id: string) => void;
  toggle: ReturnType<typeof useTogglePhraseFavorite>;
  showLang?: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);
  const meta = categoryMeta(phrase.category);
  const lang = detectLanguage(phrase.cn);
  const langFlag = showLang ? langBadge(phrase.language) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card transition-shadow"
    >
      <div className="absolute bottom-0 left-0 top-0 w-1" style={{ background: meta?.color ?? "#94a3b8" }} />

      {/* Тап — показать крупно */}
      <button
        type="button"
        onClick={() => onShow(index)}
        aria-label={`Показать крупно: ${phrase.ru}`}
        className="block w-full pb-2.5 pl-4 pr-3 pt-3 text-left active:bg-accent/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
            style={{ background: `${meta?.color}18`, color: meta?.color }}
          >
            {meta?.emoji} {meta?.label}
          </span>
          {langFlag && <span className="text-xs shrink-0" title="Язык фразы">{langFlag}</span>}
          {phrase.favorite && <Star className="size-3.5 shrink-0 fill-current text-amber-500" />}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold leading-tight break-words">{phrase.cn}</span>
          {phrase.pinyin && <span className="text-sm italic text-muted-foreground">{phrase.pinyin}</span>}
        </div>
        <p className="mt-1 text-sm text-foreground/80">{phrase.ru}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">{pronunciationLabel(lang.langPrefix)}</p>
      </button>

      {/* Действия */}
      <div className="flex items-center gap-2 border-t border-border py-2 pl-4 pr-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (speaking) return;
            speakPhrase(phrase.cn, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
          }}
          disabled={speaking}
          aria-label={speaking ? "Произносим…" : "Произнести фразу"}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 transition-all active:scale-95 disabled:opacity-60",
            speaking ? "animate-pulse bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}
        >
          <Volume2 className="size-4 shrink-0" />
          <span className="text-xs font-medium">{speaking ? "Играет…" : "Слушать"}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle.mutate(
              { id: phrase.id, favorite: !phrase.favorite },
              { onError: (err) => toast.error("Не удалось обновить избранное", { description: err instanceof Error ? err.message : undefined }) }
            );
          }}
          disabled={toggle.isPending}
          aria-label={phrase.favorite ? "Убрать из избранного" : "Добавить в избранное"}
          aria-pressed={phrase.favorite}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl transition-all active:scale-90 disabled:opacity-50",
            phrase.favorite ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
          )}
        >
          <Star className={cn("size-5", phrase.favorite && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onActions(phrase.id);
          }}
          aria-label="Ещё действия: копировать, перевести, изменить"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-all active:scale-90"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>
    </motion.div>
  );
}

/* Скелет загрузки */
function PhraseSkeleton() {
  return (
    <div className="space-y-4 animate-fade-up pb-20">
      <div className="h-44 animate-pulse rounded-3xl bg-muted" />
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-border p-4">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
