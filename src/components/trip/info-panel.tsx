"use client";

import {
  useChecklist,
  useToggleChecklist,
  useAddChecklist,
  useDeleteChecklist,
  type ChecklistItem,
  useInfo,
  useAddInfo,
  useUpdateInfo,
  useDeleteInfo,
  type InfoItem,
} from "@/hooks/use-trip";
import { useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Phone,
  Lightbulb,
  AlertCircle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  ListChecks,
  NotebookText,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import type { TripSummary } from "@/lib/types";
import { DataBackup } from "./data-backup";
import { PushSettings } from "./push-settings";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import { useTripStore } from "@/lib/trip-store";

const CHECKLIST_CATS: Record<string, { label: string; emoji: string; color: string }> = {
  documents: { label: "Документы", emoji: "📄", color: "#ef4444" },
  health: { label: "Здоровье", emoji: "💊", color: "#10b981" },
  preparation: { label: "Подготовка", emoji: "🎒", color: "#f59e0b" },
  packing_there: { label: "Сборы туда", emoji: "🧳", color: "#8b5cf6" },
  packing_back: { label: "Сборы обратно", emoji: "↩️", color: "#06b6d4" },
  other: { label: "Другое", emoji: "📌", color: "#94a3b8" },
};

// P1 #7: InfoItem types — neutral labels (not China-centric)
const INFO_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  contact: { label: "Контакты", emoji: "📞", color: "#06b6d4" },
  transport: { label: "Транспорт", emoji: "🚇", color: "#0ea5e9" },
  food: { label: "Еда", emoji: "🍽️", color: "#f97316" },
  tip: { label: "Советы", emoji: "💡", color: "#eab308" },
};

/** Готовые наборы для шаблонов чек-листа */
const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  documents: [
    "Паспорт",
    "Виза / электронное разрешение",
    "Медстраховка (полис)",
    "Авиабилеты",
    "Бронь отеля",
    "Банковские карты (две разные)",
    "Наличные в валюте страны",
    "Копии документов (бумага + облако)",
  ],
  health: [
    "Личные лекарства",
    "Базовая аптечка (жаропонижающее, пластыри)",
    "Средство от солнца",
    "Рецепты на препараты (латиницей)",
    "Санитайзер и маски",
  ],
  preparation: [
    "Офлайн-карты города",
    "Уведомить банк о поездке",
    "Проверить визовые требования",
    "Установить eSIM / включить роуминг",
    "Скачать фильмы в дорогу",
    "Записать адрес отеля без интернета",
  ],
  packing_there: [
    "Документы в ручную кладь",
    "Зарядка + адаптер розеток",
    "Powerbank",
    "Удобная обувь",
    "Одежда по погоде",
    "Гигиена (щётка, паста)",
    "Наушники",
  ],
  packing_back: [
    "Место в чемодане под сувениры",
    "Техника заряжена",
    "Паспорт и билеты под рукой",
    "Проверить сейф и розетки",
    "Чеки для tax free",
  ],
  other: ["Купить подарки близким", "Проверить погоду перед вылетом", "Заказать трансфер"],
};

/** Быстрые пресеты заголовка записи справки */
const TITLE_PRESETS = ["Экстренный номер", "Отель", "Аптека рядом", "Обмен валюты", "Аэропорт"];

const PHONE_RE = /\+?[\d][\d\s\-()]{4,}\d/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;

function findPhone(s: string): string | null {
  const m = s.match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 5 && digits.length <= 15 ? digits : null;
}

function findUrl(s: string): string | null {
  const m = s.match(URL_RE);
  return m ? m[0] : null;
}

async function copyText(text: string, label = "Скопировано") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast.success(label);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }
}

/** Фаза поездки одной строкой: до старта / день N из M / завершилась */
function tripPhaseLabel(trip: TripSummary): string {
  const DAY = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(trip.settings.startDate);
  start.setHours(0, 0, 0, 0);
  const end = trip.settings.endDate ? new Date(trip.settings.endDate) : null;
  if (end) end.setHours(0, 0, 0, 0);
  const toStart = Math.round((start.getTime() - today.getTime()) / DAY);
  if (toStart > 0) return `до старта ${toStart} ${plural(toStart, "день", "дня", "дней")}`;
  if (end && today.getTime() > end.getTime()) return "поездка завершилась";
  return `день ${trip.currentDayNumber || 1} из ${trip.settings.totalDays}`;
}

/** Кольцо готовности — подпись страницы «Инфо» */
function RingProgress({ pct, empty }: { pct: number; empty: boolean }) {
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-lg font-bold tabular-nums leading-none">{empty ? "—" : `${pct}%`}</span>
      </div>
    </div>
  );
}

export function InfoPanel() {
  const tripId = useCurrentTripId();
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">📋</div>
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

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero — кольцо готовности + фаза поездки */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-10 select-none">📋</div>
        <div className="relative flex items-center gap-4">
          <HeroProgress trip={trip} />
        </div>
      </div>

      <ChecklistView />
      <InfoView />

      {/* Push-уведомления */}
      <PushSettings />

      {/* Резервное копирование */}
      <DataBackup />
    </div>
  );
}

/** Кольцо прогресса + штамп «к вылету готов» при 100% — подпись страницы */
function HeroProgress({ trip }: { trip?: TripSummary }) {
  const { data: items } = useChecklist();
  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.done).length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  return (
    <>
      <div className="relative shrink-0">
        <RingProgress pct={pct} empty={total === 0} />
        {allDone && (
          <motion.div
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: -12, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 12 }}
            className="absolute -bottom-1.5 -right-2 text-base"
            aria-hidden
          >
            ✅
          </motion.div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-white/75 text-xs font-medium">
          <ListChecks className="size-3.5" /> Чек-лист и справка
        </div>
        <h1 className="text-xl font-bold mt-0.5">Подготовка к поездке</h1>
        <p className="text-white/80 text-sm mt-0.5 truncate">
          {trip?.settings.title}
          {trip && <span className="text-white/60"> · {tripPhaseLabel(trip)}</span>}
        </p>
        <p className="text-white/85 text-xs mt-1 tabular-nums">
          {total > 0 ? `${done} из ${total} пунктов готово` : "Чек-лист пока пуст"}
        </p>
      </div>
    </>
  );
}

function ChecklistView() {
  const { data: items, isLoading, error: itemsError, refetch } = useChecklist();
  const toggle = useToggleChecklist();
  const del = useDeleteChecklist();
  const add = useAddChecklist();
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState("preparation");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>("all");
  const [hideDone, setHideDone] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Однократное празднование: чек-лист только что стал 100%
  const prevPctRef = useRef<number | null>(null);
  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.done).length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  useEffect(() => {
    if (isLoading || !items) return;
    const prev = prevPctRef.current;
    if (prev !== null && pct === 100 && prev < 100) {
      toast.success("Чемодан собран! 🎉", { description: "Все пункты чек-листа выполнены" });
    }
    prevPctRef.current = pct;
  }, [pct, isLoading, items]);

  const knownKeys = Object.keys(CHECKLIST_CATS);
  const visibleGroups = useMemo(() => {
    const grouped = knownKeys.map((cat) => ({
      cat,
      meta: CHECKLIST_CATS[cat],
      items:
        cat === "other"
          ? (items ?? []).filter((i) => i.category === "other" || !knownKeys.includes(i.category))
          : (items ?? []).filter((i) => i.category === cat),
    }));
    return grouped
      .filter((g) => catFilter === "all" || g.cat === catFilter)
      .map((g) => ({ ...g, items: hideDone ? g.items.filter((i) => !i.done) : g.items }))
      .filter((g) => g.items.length > 0);
     
  }, [items, catFilter, hideDone]);

  // Чипы фильтра — только непустые категории
  const filterCats = knownKeys
    .map((cat) => ({
      cat,
      meta: CHECKLIST_CATS[cat],
      count: (items ?? []).filter(
        (i) => (cat === "other" ? i.category === "other" || !knownKeys.includes(i.category) : i.category === cat)
      ).length,
    }))
    .filter((c) => c.count > 0);

  // P1 #8: submit with try/catch — toast onSuccess only
  const submit = async () => {
    const text = newItem.trim();
    if (!text) return;
    try {
      await add.mutateAsync({ text, category: newCat });
      setNewItem("");
      toast.success("Добавлено в чек-лист");
    } catch (err) {
      toast.error("Не удалось добавить пункт", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  if (itemsError) {
    return (
      <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-red-500" />
        <p className="text-sm text-red-500">Не удалось загрузить чек-лист</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading || !items) return <Skeleton />;

  return (
    <section className="space-y-3">
      {/* Заголовок секции */}
      <div className="flex items-center justify-between px-1">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ListChecks className="size-4 text-sky-500" /> Чек-лист
          {total > 0 && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {done}/{total}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setTemplatesOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 min-h-9 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm active:scale-95 transition-transform"
        >
          <Sparkles className="size-3.5" /> Шаблоны
        </button>
      </div>

      {/* Быстрое добавление: input + чипы категории */}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !add.isPending) submit();
            }}
            placeholder="Новый пункт…"
            maxLength={200}
            className="w-full min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <button
            onClick={submit}
            disabled={add.isPending || !newItem.trim()}
            aria-label="Добавить пункт в чек-лист"
            className="shrink-0 min-h-[44px] w-11 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-50 active:scale-95 transition-transform"
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </button>
        </div>
        <div className="chip-rail no-scrollbar -mx-1 px-1">
          {Object.entries(CHECKLIST_CATS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setNewCat(k)}
              aria-pressed={newCat === k}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-9",
                newCat === k
                  ? "border-transparent text-white shadow-sm"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
              style={newCat === k ? { background: v.color } : undefined}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Фильтры: категории + скрыть готовое */}
      {total > 0 && (
        <div className="chip-rail no-scrollbar -mx-1 px-1">
          <FilterChip active={catFilter === "all"} onClick={() => setCatFilter("all")} label={`Все · ${total}`} />
          {filterCats.map(({ cat, meta, count }) => (
            <FilterChip
              key={cat}
              active={catFilter === cat}
              onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
              label={`${meta.emoji} ${meta.label} · ${count}`}
            />
          ))}
          <button
            type="button"
            onClick={() => setHideDone((v) => !v)}
            aria-pressed={hideDone}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-9 flex items-center gap-1.5",
              hideDone ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground"
            )}
          >
            {hideDone ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            Скрыть готовое
          </button>
        </div>
      )}

      {/* По категориям — схлопываем пустые */}
      {total === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-8 text-center">
          <CheckCircle2 className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Чек-лист пуст</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-3">Начни с готового набора — это быстрее</p>
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-4 min-h-11 rounded-xl bg-primary text-primary-foreground active:scale-95 transition-transform"
          >
            <Sparkles className="size-3.5" /> Открыть шаблоны
          </button>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-8 text-center">
          <div className="text-3xl mb-1">🎉</div>
          <p className="text-sm text-muted-foreground">
            {hideDone ? "В этой выборке всё выполнено!" : "В этой категории пусто"}
          </p>
        </div>
      ) : (
        visibleGroups.map(({ cat, meta, items: catItems }) => {
          const catDone = catItems.filter((i) => i.done).length;
          const catPct = Math.round((catDone / catItems.length) * 100);
          return (
            <div key={cat} className="rounded-2xl bg-card border border-border p-4 overflow-hidden">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">{meta.emoji}</span>
                <h3 className="font-semibold text-sm" style={{ color: meta.color }}>{meta.label}</h3>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {catDone}/{catItems.length}
                </span>
              </div>
              {/* Мини-прогресс категории */}
              <div className="h-1 rounded-full bg-muted overflow-hidden mb-2">
                <motion.div
                  initial={false}
                  animate={{ width: `${catPct}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full rounded-full"
                  style={{ background: meta.color }}
                />
              </div>
              <div className="space-y-1">
                <AnimatePresence>
                  {catItems.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      togglePending={togglingId === item.id}
                      onToggle={() => {
                        setTogglingId(item.id);
                        toggle.mutate(
                          { id: item.id, done: !item.done },
                          {
                            onSettled: () => setTogglingId(null),
                            onError: (err) =>
                              toast.error("Не удалось обновить", {
                                description: err instanceof Error ? err.message : "",
                              }),
                          }
                        );
                      }}
                      onDelete={async (id) => {
                        try {
                          await del.mutateAsync(id);
                          toast.success("Удалено");
                        } catch (err) {
                          toast.error("Не удалось удалить", { description: err instanceof Error ? err.message : "" });
                        }
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })
      )}

      <TemplatesSheet open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </section>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-9",
        active ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}

// P1 #9: confirm delete on checklist items
function ChecklistRow({
  item,
  onToggle,
  onDelete,
  togglePending,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onDelete: (id: string) => Promise<void>;
  togglePending?: boolean;
}) {
  const update = useToggleChecklist();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = () => {
    if (text.trim() && text !== item.text) {
      update.mutate(
        { id: item.id, text: text.trim() },
        {
          onSuccess: () => toast.success("Обновлено"),
          onError: (err) => toast.error("Не удалось обновить", { description: err instanceof Error ? err.message : "" }),
        }
      );
    }
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent group"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!!togglePending || update.isPending}
        aria-label={item.done ? "Снять отметку" : "Отметить как выполненное"}
        className="shrink-0 size-11 grid place-items-center disabled:opacity-50"
      >
        {item.done ? (
          <CheckCircle2 className="size-5 text-green-500" />
        ) : (
          <Circle className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      {editing ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setText(item.text); setEditing(false); }
          }}
          onBlur={save}
          autoFocus
          className="flex-1 min-w-0 text-sm bg-background border border-input rounded px-2 py-1 outline-none focus:ring-1 ring-primary"
        />
      ) : (
        <span
          className={cn("text-sm flex-1 min-w-0 cursor-text", item.done && "line-through opacity-50")}
          onClick={() => setEditing(true)}
        >
          {item.text}
        </span>
      )}
      {!editing && (
        <>
          <button
            onClick={() => { setText(item.text); setEditing(true); }}
            aria-label="Редактировать пункт"
            className="size-9 shrink-0 rounded-md hover:bg-accent grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={async () => { await onDelete(item.id); setConfirmingDelete(false); }}
                disabled={update.isPending}
                aria-label="Подтвердить удаление"
                className="btn-confirm-yes"
              >
                Да
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                aria-label="Отменить удаление"
                className="btn-confirm-no"
              >
                Нет
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Удалить пункт"
              className="size-11 shrink-0 rounded-xl hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

/** Шаблоны чек-листа: готовые наборы по категориям */
function TemplatesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const add = useAddChecklist();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const selectedCount = Object.values(sel).filter(Boolean).length;

  const toggleSel = (cat: string, text: string) => {
    const key = `${cat}::${text}`;
    setSel((s) => ({ ...s, [key]: !s[key] }));
  };

  const confirm = async () => {
    const entries = Object.keys(sel)
      .filter((k) => sel[k])
      .map((k) => {
        const [cat, ...rest] = k.split("::");
        return { category: cat, text: rest.join("::") };
      });
    if (!entries.length) return;
    try {
      await Promise.all(entries.map((e) => add.mutateAsync(e)));
      toast.success(`Добавлено: ${entries.length} ${plural(entries.length, "пункт", "пункта", "пунктов")}`);
      onOpenChange(false);
      setSel({});
    } catch (err) {
      toast.error("Не удалось добавить набор", {
        description: err instanceof Error ? err.message : "",
      });
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Шаблоны чек-листа"
      titleIcon={<Sparkles className="size-5 text-sky-500" />}
    >
      <p className="text-xs text-muted-foreground -mt-1 mb-3">
        Отметь нужное — добавится в чек-лист одним махом.
      </p>
      <div className="space-y-4 pb-2">
        {Object.entries(CHECKLIST_TEMPLATES).map(([cat, texts]) => {
          const meta = CHECKLIST_CATS[cat];
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{meta.emoji}</span>
                <h3 className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</h3>
                <span className="text-[10px] text-muted-foreground tabular-nums">{texts.length}</span>
              </div>
              <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                {texts.map((text) => {
                  const key = `${cat}::${text}`;
                  const checked = !!sel[key];
                  return (
                    <button
                      key={text}
                      type="button"
                      onClick={() => toggleSel(cat, text)}
                      aria-pressed={checked}
                      className="w-full min-h-11 flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-accent transition-colors"
                    >
                      <span
                        className={cn(
                          "size-5 rounded-md border grid place-items-center shrink-0 transition-colors",
                          checked ? "border-transparent text-white" : "border-muted-foreground/40"
                        )}
                        style={checked ? { background: meta.color } : undefined}
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                      <span className={cn("text-sm", checked && "text-muted-foreground")}>{text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Липкая кнопка добавления */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-card/95 backdrop-blur border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={confirm}
          disabled={selectedCount === 0 || add.isPending}
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium grid place-items-center disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {add.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : selectedCount > 0 ? (
            `Добавить ${selectedCount} ${plural(selectedCount, "пункт", "пункта", "пунктов")}`
          ) : (
            "Отметь пункты выше"
          )}
        </button>
      </div>
    </MobileBottomSheet>
  );
}

// P1 #7: Minimal InfoItem UI (was API+hooks but no UI)
function InfoView() {
  const { data: items, isLoading, error: itemsError } = useInfo();
  const del = useDeleteInfo();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // form: null | { mode: "add" } | { mode: "edit"; item: InfoItem }
  const [form, setForm] = useState<null | { mode: "add" } | { mode: "edit"; item: InfoItem }>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  if (itemsError) {
    return (
      <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-red-500" />
        <p className="text-sm text-red-500">Не удалось загрузить справку</p>
      </div>
    );
  }

  const all = items ?? [];
  const detailItem = detailId ? all.find((i) => i.id === detailId) ?? null : null;
  const editItem = form?.mode === "edit" ? all.find((i) => i.id === form.item.id) ?? form.item : null;

  const filterTypes = Object.keys(INFO_TYPES)
    .map((t) => ({ t, meta: INFO_TYPES[t], count: all.filter((i) => i.type === t).length }))
    .filter((g) => g.count > 0);

  const grouped = Object.keys(INFO_TYPES)
    .map((t) => ({
      type: t,
      meta: INFO_TYPES[t],
      items: all.filter((i) => i.type === t && (typeFilter === "all" || typeFilter === t)),
    }))
    .filter((g) => g.items.length > 0);

  const handleDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success("Удалено");
      setDetailId(null);
    } catch (err) {
      toast.error("Не удалось удалить", { description: err instanceof Error ? err.message : "" });
    }
  };

  return (
    <section className="space-y-3">
      {/* Заголовок + кнопка добавить */}
      <div className="flex items-center justify-between px-1">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <NotebookText className="size-4 text-cyan-500" /> Справка поездки
        </h2>
        <button
          onClick={() => setForm({ mode: "add" })}
          aria-label="Добавить запись в справку"
          className="flex items-center gap-1 text-xs px-3 min-h-9 rounded-full bg-primary text-primary-foreground font-medium active:scale-95 transition-transform"
        >
          <Plus className="size-3.5" /> Добавить
        </button>
      </div>

      {/* Фильтр по типам */}
      {all.length > 0 && (
        <div className="chip-rail no-scrollbar -mx-1 px-1">
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} label={`Все · ${all.length}`} />
          {filterTypes.map(({ t, meta, count }) => (
            <FilterChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
              label={`${meta.emoji} ${meta.label} · ${count}`}
            />
          ))}
        </div>
      )}

      {/* Список по типам */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка…
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-8 text-center">
          <Lightbulb className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Справка пуста</p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-3">
            Контакты, транспорт и советы — всё под рукой офлайн
          </p>
          <button
            type="button"
            onClick={() => setForm({ mode: "add" })}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-4 min-h-11 rounded-xl bg-primary text-primary-foreground active:scale-95 transition-transform"
          >
            <Plus className="size-3.5" /> Первая запись
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-6 text-center">
          <p className="text-sm text-muted-foreground">В этом типе пусто</p>
        </div>
      ) : (
        grouped.map(({ type: t, meta, items: typeItems }) => (
          <div key={t} className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{meta.emoji}</span>
              <h3 className="font-semibold text-sm" style={{ color: meta.color }}>{meta.label}</h3>
            </div>
            <div className="space-y-2">
              {typeItems.map((item) => (
                <InfoItemCard key={item.id} item={item} onOpen={() => setDetailId(item.id)} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Детальная шторка записи; key — remount при смене записи, чтобы
          confirmingDelete не протекал между открытиями */}
      <InfoDetailSheet
        key={detailItem?.id ?? "closed"}
        item={detailItem}
        onClose={() => setDetailId(null)}
        onEdit={(item) => setForm({ mode: "edit", item })}
        onDelete={(id) => handleDelete(id)}
      />

      {/* Форма добавления / редактирования */}
      {form?.mode === "add" && (
        <InfoFormSheet
          key="add"
          open
          onOpenChange={(v) => !v && setForm(null)}
        />
      )}
      {form?.mode === "edit" && editItem && (
        <InfoFormSheet
          key={`edit-${editItem.id}`}
          open
          onOpenChange={(v) => !v && setForm(null)}
          item={editItem}
        />
      )}
    </section>
  );
}

function InfoItemCard({ item, onOpen }: { item: InfoItem; onOpen: () => void }) {
  const phone = findPhone(item.content);
  const url = findUrl(item.content);
  return (
    <div className="rounded-xl bg-muted/30 hover:bg-accent/60 transition-colors p-1 flex items-stretch gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left px-2.5 py-2 rounded-lg"
      >
        <div className="text-sm font-medium flex items-center gap-1.5">
          <span className="truncate">{item.title}</span>
          {phone && <Phone className="size-3 shrink-0 text-muted-foreground" />}
          {url && <ExternalLink className="size-3 shrink-0 text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{item.content}</p>
      </button>
      <button
        type="button"
        onClick={() => copyText(`${item.title}\n${item.content}`, "Скопировано")}
        aria-label={`Скопировать «${item.title}»`}
        className="shrink-0 size-11 self-center rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95 transition-transform"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

/** Детальная шторка: полный текст + копировать / позвонить / ссылка / редактировать / удалить */
function InfoDetailSheet({
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  item: InfoItem | null;
  onClose: () => void;
  onEdit: (item: InfoItem) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  if (!item) return null;

  const meta = INFO_TYPES[item.type] ?? { label: item.type, emoji: "📌", color: "#94a3b8" };
  const phone = findPhone(item.content);
  const url = findUrl(item.content);

  return (
    <MobileBottomSheet
      open={!!item}
      onOpenChange={(v) => !v && onClose()}
      title={item.title}
      titleIcon={<span className="text-lg">{meta.emoji}</span>}
    >
      <div className="space-y-4">
        <span
          className="inline-block rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: `${meta.color}1a`, color: meta.color }}
        >
          {meta.label}
        </span>

        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{item.content}</p>

        {/* Действия */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => copyText(`${item.title}\n${item.content}`, "Скопировано")}
            className="min-h-11 rounded-xl border border-border flex items-center justify-center gap-1.5 text-sm font-medium hover:bg-accent active:scale-95 transition-transform"
          >
            <Copy className="size-4" /> Скопировать
          </button>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="min-h-11 rounded-xl border border-border flex items-center justify-center gap-1.5 text-sm font-medium hover:bg-accent active:scale-95 transition-transform"
            >
              <Phone className="size-4" /> Позвонить
            </a>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "min-h-11 rounded-xl border border-border flex items-center justify-center gap-1.5 text-sm font-medium hover:bg-accent active:scale-95 transition-transform",
                !phone && "col-span-2"
              )}
            >
              <ExternalLink className="size-4" /> Открыть ссылку
            </a>
          )}
        </div>

        {/* Редактировать / удалить */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <Pencil className="size-4" /> Редактировать
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={async () => { await onDelete(item.id); }}
                aria-label="Подтвердить удаление"
                className="btn-confirm-yes px-4"
              >
                Удалить
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                aria-label="Отменить удаление"
                className="btn-confirm-no"
              >
                Нет
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Удалить запись"
              className="size-11 rounded-xl border border-border grid place-items-center text-muted-foreground hover:text-red-500 hover:border-red-500/40 active:scale-95 transition-all"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </MobileBottomSheet>
  );
}

/** Форма добавления/редактирования записи справки в шторке */
function InfoFormSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: InfoItem;
}) {
  const editing = !!item;
  const add = useAddInfo();
  const update = useUpdateInfo();
  const [type, setType] = useState(item?.type ?? "contact");
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Заполните заголовок и текст");
      return;
    }
    try {
      if (editing && item) {
        await update.mutateAsync({ id: item.id, type, title: title.trim(), content: content.trim() });
        toast.success("Сохранено");
      } else {
        await add.mutateAsync({ type, title: title.trim(), content: content.trim() });
        toast.success("Добавлено в справку");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(editing ? "Не удалось сохранить" : "Не удалось добавить", {
        description: err instanceof Error ? err.message : "",
      });
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Редактировать запись" : "Новая запись"}
      titleIcon={<NotebookText className="size-5 text-cyan-500" />}
      zIndexClass="z-[110]"
    >
      <div className="space-y-3">
        {/* Тип — чипы вместо select */}
        <div className="chip-rail no-scrollbar -mx-1 px-1">
          {Object.entries(INFO_TYPES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              aria-pressed={type === k}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-9",
                type === k ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground hover:bg-accent"
              )}
              style={type === k ? { background: v.color } : undefined}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок (например, Экстренный номер)"
            maxLength={200}
            className="w-full min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          {!editing && (
            <div className="chip-rail no-scrollbar -mx-1 px-1">
              {TITLE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTitle(p)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground border border-dashed border-border hover:bg-accent min-h-8 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"Текст… номер телефона, адрес, ссылка"}
          rows={5}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
        />

        <button
          onClick={handleSave}
          disabled={add.isPending || update.isPending}
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium grid place-items-center disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {add.isPending || update.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : editing ? (
            "Сохранить"
          ) : (
            "Добавить запись"
          )}
        </button>
      </div>
    </MobileBottomSheet>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-2.5 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
