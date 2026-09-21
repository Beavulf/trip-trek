"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Compass,
  Loader2,
  MapPin,
  Pencil,
  RotateCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/types";
import { timeLabel } from "@/lib/time-of-day";
import type { PlannerDayDraft, PlannerPlaceDraft } from "@/lib/planner";
import { useRouteDays } from "@/hooks/use-trip";
import { useAiPlanner, useCreatePlacesBatch } from "@/hooks/trip/use-ai-planner";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AiDisclaimer } from "../ai-disclaimer";

// Визард планера: шаг 1 — запрос (область, интересы, темп, бюджет, пожелания),
// шаг 2 — черновик маршрута в пластике «нити» из Итинерария: дни-станции,
// места-карточки с честной телеметрией геокодинга («на карте ✓ / уточнить ✎»).
// Ничего не попадает в поездку без явного «Добавить в маршрут».
// Оболочка — общий MobileBottomSheet (портал в body): фуллскрин-оверлей внутри
// дерева вкладок ловил transform-предка — fixed съезжал и резал контент снизу.

const INTERESTS = ["музеи", "уличная еда", "природа", "архитектура", "виды", "рынки", "парки", "местная жизнь"];

const LOADING_LINES = [
  "Читаем карту города…",
  "Подбираем места под интересы…",
  "Раскладываем по дням и времени…",
  "Сверяем координаты на карте…",
];

interface WizardDraft {
  dayNumber: number;
  city: string;
  accent: string;
  places: (PlannerPlaceDraft & { key: string })[];
}

export function PlannerWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: days } = useRouteDays();
  const planner = useAiPlanner();
  const batch = useCreatePlacesBatch();
  // Фокус-трап, Escape, возврат фокуса (scroll-lock — в примитиве шторки)
  const panelRef = useDialogA11y<HTMLDivElement>(open, () => onOpenChange(false));

  // Состояние черновика живёт ровно сессию планера: пересобираем при каждом открытии
  const [step, setStep] = useState<"form" | "draft">("form");
  const [scope, setScope] = useState<"trip" | number>("trip");
  const [interests, setInterests] = useState<string[]>([]);
  const [pace, setPace] = useState<"relaxed" | "packed" | null>(null);
  const [budget, setBudget] = useState<"low" | "medium" | "any" | null>(null);
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<WizardDraft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [geoNote, setGeoNote] = useState("");
  const [lineIdx, setLineIdx] = useState(0);

  // Рендер-синхронизация при открытии (паттерн WalkView) — сброс прошлой сессии
  const [synced, setSynced] = useState<string | null>(null);
  const syncKey = open ? "open" : null;
  if (synced !== syncKey) {
    setSynced(syncKey);
    if (open) {
      setStep("form");
      setScope("trip");
      setInterests([]);
      setPace(null);
      setBudget(null);
      setNotes("");
      setDrafts([]);
      setSelected(new Set());
      setGeoNote("");
      setLineIdx(0);
    }
  }

  // Ждать придётся до минуты (LLM + геокодинг) — честно проговариваем это вслух
  useEffect(() => {
    if (!open || !planner.isPending) return;
    const t = setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 3500);
    return () => clearInterval(t);
  }, [open, planner.isPending]);

  // Смена шага/фазы — панель к началу, иначе черновик открывается прокрученным
  useEffect(() => {
    if (open) panelRef.current?.scrollTo({ top: 0 });
  }, [open, step, planner.isPending, panelRef]);

  const dayList = useMemo(() => days ?? [], [days]);

  const run = async (overrides?: { mode: "day" | "replace"; dayNumber: number; exclude: string[]; replaceName?: string }) => {
    try {
      const res = await planner.mutateAsync(
        overrides
          ? {
              mode: overrides.mode,
              dayNumber: overrides.dayNumber,
              exclude: overrides.exclude,
              interests,
              pace,
              budget,
              notes,
            }
          : {
              mode: scope === "trip" ? "trip" : "day",
              dayNumber: scope === "trip" ? undefined : scope,
              interests,
              pace,
              budget,
              notes,
            }
      );

      const withKey = (dayNumber: number, p: PlannerPlaceDraft, i: number) => ({ ...p, key: `${dayNumber}:${p.name}:${i}` });
      const next: WizardDraft[] = res.drafts.map((d) => ({
        dayNumber: d.dayNumber,
        city: dayList.find((x) => x.dayNumber === d.dayNumber)?.city ?? "",
        accent: dayList.find((x) => x.dayNumber === d.dayNumber)?.accentColor ?? "#f97316",
        places: d.places.map((p, i) => withKey(d.dayNumber, p, i)),
      }));

      let updated: WizardDraft[];
      if (overrides?.mode === "replace" && overrides.replaceName) {
        // Замена ОДНОЙ карточки: убираем её, остальные дня остаются; полный
        // exclude ушёл серверу только чтобы не предложить то же самое снова.
        updated = drafts.map((d) =>
          d.dayNumber === overrides.dayNumber
            ? { ...d, places: [...d.places.filter((p) => p.name !== overrides.replaceName), ...(next.find((n) => n.dayNumber === overrides.dayNumber)?.places ?? [])] }
            : d
        );
      } else if (overrides?.mode === "day") {
        // Пересборка дня: заменяем только его секцию, чужие дни не трогаем
        updated = drafts.map((d) => (d.dayNumber === overrides.dayNumber ? next.find((n) => n.dayNumber === overrides.dayNumber) ?? d : d));
      } else {
        updated = next;
      }
      setDrafts(updated);
      // Выбор пересобираем из фактических карточек: новые — отмечены,
      // удалённые/пересобранные ключи исчезают, чужие дни сохраняют галочки
      setSelected(new Set(updated.flatMap((d) => d.places.map((p) => p.key))));
      setGeoNote(res.geoNote);
      setStep("draft");
      if (overrides?.mode === "replace") toast("Замена готова");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Планер недоступен");
    }
  };

  const apply = async () => {
    const selectedAll = drafts.flatMap((d) =>
      d.places.filter((p) => selected.has(p.key)).map((p) => ({ day: d.dayNumber, p }))
    );
    // Место без координат создать нельзя (POST требует lat/lng) — честно пропускаем
    const creatable = selectedAll.filter((x) => x.p.lat !== null && x.p.lng !== null);
    const skipped = selectedAll.length - creatable.length;
    if (skipped > 0) {
      toast.info(`Без точки на карте пропущено: ${skipped} — их можно добавить вручную`);
    }
    if (creatable.length === 0) return;
    try {
      const res = await batch.mutateAsync(
        creatable.map(({ day, p }) => ({
          dayId: dayList.find((x) => x.dayNumber === day)?.id ?? "",
          name: p.name,
          category: p.category,
          lat: p.lat as number,
          lng: p.lng as number,
          timeOfDay: p.timeOfDay,
          description: p.why,
          address: p.address,
        }))
      );
      toast.success(`Добавлено мест: ${res.created}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось добавить места");
    }
  };

  const totalSelected = selected.size;
  const unlocated = drafts.flatMap((d) => d.places).filter((p) => p.geoConfidence === "fail" && selected.has(p.key)).length;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Подборка мест"
      titleIcon={<Sparkles className="size-5 text-[#d946ef]" aria-hidden />}
      panelRef={panelRef}
      role="dialog"
      ariaLabel="Подборка мест от ИИ"
      contentClassName="px-0 py-0"
    >
      {planner.isPending ? (
        <LoadingBody line={LOADING_LINES[lineIdx]} />
      ) : step === "form" ? (
        /* ─── Шаг 1: запрос ─── */
        <>
          <div className="px-4 sm:px-5 py-4 space-y-5">
            {/* Механика подбора неочевидна («почему места кучкуются у отеля?»),
                объясняем до формы: якорь = места дня, пустой день = пожелания или лучшее в городе */}
            <section className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">как это работает</p>
              <ul className="space-y-1.5 text-[11px] leading-snug text-muted-foreground">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>Добавьте в день отель или хотя бы одно место — ИИ подберёт остальное рядом с ними.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>Пустой день? Опишите пожелания — без них предложим просто лучшие места города.</span>
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">что планируем</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={scope === "trip"} onClick={() => setScope("trip")}>
                  Вся поездка
                </Chip>
                {dayList.map((d) => (
                  <Chip key={d.id} active={scope === d.dayNumber} onClick={() => setScope(d.dayNumber)}>
                    День {d.dayNumber} · {d.city}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">интересы</p>
              <div className="flex flex-wrap gap-1.5">
                {INTERESTS.map((i) => (
                  <Chip
                    key={i}
                    active={interests.includes(i)}
                    onClick={() => setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
                  >
                    {i}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">темп</p>
              <div className="grid grid-cols-2 gap-1 p-1 bg-card border border-border rounded-xl">
                <Chip
                  active={pace === "relaxed"}
                  onClick={() => setPace(pace === "relaxed" ? null : "relaxed")}
                  className="justify-center min-h-10 rounded-lg"
                >
                  🐢 Спокойно
                </Chip>
                <Chip
                  active={pace === "packed"}
                  onClick={() => setPace(pace === "packed" ? null : "packed")}
                  className="justify-center min-h-10 rounded-lg"
                >
                  ⚡ Плотно
                </Chip>
              </div>
            </section>

            <section className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">бюджет</p>
              <div className="grid grid-cols-3 gap-1 p-1 bg-card border border-border rounded-xl">
                {(
                  [
                    { id: "low", label: "Бюджетно" },
                    { id: "medium", label: "Средний" },
                    { id: "any", label: "Не важно" },
                  ] as const
                ).map((b) => (
                  <Chip
                    key={b.id}
                    active={budget === b.id}
                    onClick={() => setBudget(budget === b.id ? null : b.id)}
                    className="justify-center min-h-10 rounded-lg"
                  >
                    {b.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">пожелания (необязательно)</p>
              <textarea
                rows={3}
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: с детьми, без лестниц, хотим ночью увидеть подсветку…"
                className="w-full rounded-2xl border border-border bg-card px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
              />
            </section>

            <AiDisclaimer text="ИИ предлагает варианты мест, а не готовый маршрут — порядок и дорогу выстраиваете вы. Названия и точки на карте проверяйте: ИИ может ошибаться." />
          </div>

          {/* CTA — липкий низ шторки, виден всегда */}
          <footer className="sticky bottom-0 z-10 bg-card/95 backdrop-blur border-t border-border px-4 sm:px-5 py-3">
            <button
              type="button"
              onClick={() => run()}
              disabled={planner.isPending || dayList.length === 0}
              className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              <Sparkles className="size-4" /> Подобрать места
            </button>
            <p className="text-center text-[10px] text-muted-foreground mt-1.5">3 генерации в час · обычно 30–60 секунд</p>
          </footer>
        </>
      ) : (
        /* ─── Шаг 2: черновик ─── */
        <>
          <div className="px-4 sm:px-5 py-4">
            <p className="text-[11px] text-muted-foreground px-1 mb-3">
              {geoNote}
              {unlocated > 0 ? ` · без точки на карте: ${unlocated}` : ""}
            </p>
            <div className="relative">
              <div className="absolute left-[11px] top-3 bottom-3 w-0.5 rounded-full bg-border" aria-hidden="true" />
              <div className="space-y-4">
                {drafts.map((d) => (
                  <section key={d.dayNumber} className="relative">
                    <div className="flex items-center gap-2 mb-2 pl-8">
                      <span className="size-2.5 rounded-full shrink-0 -ml-8 relative z-10 ring-4 ring-card" style={{ background: d.accent }} aria-hidden />
                      <h2 className="text-sm font-bold">День {d.dayNumber}</h2>
                      <span className="text-xs text-muted-foreground truncate">{d.city}</span>
                      <button
                        type="button"
                        onClick={() => run({ mode: "day", dayNumber: d.dayNumber, // exclude по всем дням: черновики ещё не в БД, сервер про них не знает
                          exclude: drafts.flatMap((x) => x.places.map((y) => y.name)) })}
                        disabled={planner.isPending}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
                      >
                        <RotateCw className="size-3" /> Пересобрать
                      </button>
                    </div>
                    <div className="space-y-2 pl-8">
                      {d.places.map((p) => {
                        const meta = CATEGORY_META[p.category];
                        const on = selected.has(p.key);
                        return (
                          <motion.div
                            key={p.key}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "rounded-2xl border p-3 transition-colors",
                              on ? "border-primary/50 bg-primary/5" : "border-border bg-card opacity-60"
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`Взять «${p.name}»`}
                                onClick={() =>
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(p.key)) next.delete(p.key);
                                    else next.add(p.key);
                                    return next;
                                  })
                                }
                                className={cn(
                                  "mt-0.5 size-6 rounded-lg border-2 grid place-items-center shrink-0 transition-colors",
                                  on ? "bg-primary border-primary text-primary-foreground" : "border-border"
                                )}
                              >
                                {on && <Check className="size-3.5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium leading-snug">{meta?.emoji ?? "📍"} {p.name}</span>
                                  {p.timeOfDay && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-medium whitespace-nowrap">
                                      {timeLabel(p.timeOfDay, { emoji: true })}
                                    </span>
                                  )}
                                  {p.budgetHint && <span className="font-mono text-[10px] text-muted-foreground">{p.budgetHint}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{p.why}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                  {p.geoConfidence === "fail" ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                      <Pencil className="size-3" /> нет на карте — поставьте точку после добавления
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                      <MapPin className="size-3" /> найдено на карте{p.geoConfidence === "approx" ? " (проверьте точку)" : ""}
                                    </span>
                                  )}
                                  {p.farWarning && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title="Место далеко от остальных мест дня или вашего отеля — проверьте, так ли нужно">
                                      <TriangleAlert className="size-3" /> {p.farWarning}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => run({ mode: "replace", dayNumber: d.dayNumber, replaceName: p.name, exclude: drafts.flatMap((x) => x.places.map((y) => y.name)) })}
                                    disabled={planner.isPending}
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                  >
                                    <RotateCw className="size-3" /> заменить
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <AiDisclaimer className="mt-4 px-1" />
          </div>

          {/* Нижняя панель черновика — липкий низ шторки */}
          <footer className="sticky bottom-0 z-10 bg-card/95 backdrop-blur border-t border-border px-4 sm:px-5 py-3 space-y-1.5">
            <button
              type="button"
              onClick={apply}
              disabled={totalSelected === 0 || batch.isPending}
              className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <Compass className="size-4" />}
              Добавить в маршрут · {totalSelected} {plural(totalSelected, "место", "места", "мест")}
            </button>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="w-full min-h-9 rounded-xl text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Изменить запрос
            </button>
          </footer>
        </>
      )}
    </MobileBottomSheet>
  );
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-3 min-h-9 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function LoadingBody({ line }: { line: string }) {
  return (
    <div className="px-6 min-h-[45vh] grid place-items-center">
      <div className="text-center space-y-4">
        {/* Нить «рисуется»: та же метафора маршрута */}
        <div className="mx-auto relative h-24 w-0.5 rounded-full bg-border overflow-hidden">
          <motion.div
            className="absolute inset-x-0 top-0 h-8 rounded-full bg-gradient-to-b from-transparent via-[#d946ef] to-transparent"
            animate={{ y: [-32, 96] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
            aria-hidden
          />
        </div>
        <p className="text-sm font-medium">{line}</p>
        <p className="text-[11px] text-muted-foreground">ИИ подбирает места и сверяет их с картой — это занимает до минуты</p>
      </div>
    </div>
  );
}
