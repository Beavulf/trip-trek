"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus, Repeat, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SPLIT_CATEGORIES, suggestCategory } from "@/lib/split/categories";
import { localDateKey } from "@/lib/split/dates";
import {
  defaultDraft,
  draftFromExpense,
  draftFromRecurring,
  evaluateSplit,
  exactFromEqual,
  recentTemplates,
  type SplitDraft,
} from "@/lib/split/expense-form";
import { bpToInput, formatCents } from "@/lib/split/money";
import { evenPercents, type SplitMode } from "@/lib/split/split";
import { recurrenceHint } from "@/lib/split/recurrence-text";
import type { SplitExpenseDTO, SplitRecurringDTO } from "@/lib/split/types";
import { useDeleteExpense, useSaveExpense, useSaveRecurring, useSplitGroups, type ExpenseForm } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { AmountFieldView, useAmountField } from "./amount-field";
import { MemberAvatar, Segmented, inputClass } from "./ui";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: GroupModel;
  /** Правка существующей траты; null — новая */
  editing: SplitExpenseDTO | null;
  /** Правка шаблона повторяющейся траты (вместо даты — число месяца) */
  recurring?: SplitRecurringDTO | null;
  /** Новая трата сразу с включённым «Повторять каждый месяц» (кнопка из раздела «Повторяющиеся») */
  presetRepeat?: boolean;
}

export function ExpenseSheet({ open, onOpenChange, model, editing, recurring = null, presetRepeat = false }: Props) {
  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={recurring ? "Изменить повтор" : editing ? "Изменить трату" : presetRepeat ? "Повторяющаяся трата" : "Новая трата"}
    >
      {/* Форма живёт только пока шит открыт: каждое открытие — чистое состояние */}
      <ExpenseFormBody model={model} editing={editing} recurring={recurring} presetRepeat={presetRepeat} onDone={() => onOpenChange(false)} />
    </MobileBottomSheet>
  );
}

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: "equal", label: "Поровну" },
  { value: "exact", label: "Суммы" },
  { value: "shares", label: "Доли" },
  { value: "percent", label: "%" },
];

function ExpenseFormBody({
  model,
  editing,
  recurring,
  presetRepeat,
  onDone,
}: {
  model: GroupModel;
  editing: SplitExpenseDTO | null;
  recurring: SplitRecurringDTO | null;
  presetRepeat: boolean;
  onDone: () => void;
}) {
  const group = model.group!;
  const today = useMemo(() => localDateKey(), []);
  const save = useSaveExpense(group.id, group.myMemberId);
  const saveRecurring = useSaveRecurring(group.id);
  const del = useDeleteExpense(group.id);

  // Кого показывать в форме: активные + те, кто уже стоит в правимой трате (вышедший не пропадает из неё молча)
  const people = useMemo(() => {
    const ids = new Set(model.activeMembers.map((m) => m.id));
    const extra = editing
      ? [editing.paidById, ...editing.shares.map((s) => s.memberId)]
      : recurring
        ? [recurring.paidById, ...recurring.template.map((t) => t.memberId)]
        : [];
    const former = extra.filter((id, i) => !ids.has(id) && extra.indexOf(id) === i).flatMap((id) => {
      const m = model.membersById.get(id);
      return m ? [m] : [];
    });
    return [...model.activeMembers, ...former];
  }, [model.activeMembers, model.membersById, editing, recurring]);
  const orderedIds = useMemo(() => people.map((p) => p.id), [people]);

  const seed = editing ?? recurring;
  // Сумма + валюта ввода; amountCents ниже — всегда в валюте ГРУППЫ (пересчитанная), с ней работают деление и баланс
  const amount = useAmountField(group.currency, seed);
  const [description, setDescription] = useState(seed?.description ?? "");
  const [category, setCategory] = useState(seed?.category ?? "groceries");
  const categoryTouched = useRef(!!seed);
  const [paidById, setPaidById] = useState(seed?.paidById ?? group.myMemberId);
  const [dayOfMonth, setDayOfMonth] = useState(recurring?.dayOfMonth ?? Number(today.slice(8, 10)));
  const [spentOn, setSpentOn] = useState(editing?.spentOn ?? today);
  const [customDate, setCustomDate] = useState(false);
  const [note, setNote] = useState(editing?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(!!editing?.note);
  const [mode, setMode] = useState<SplitMode>(seed?.splitMode ?? "equal");
  const [draft, setDraft] = useState<SplitDraft>(() =>
    editing
      ? draftFromExpense(editing, orderedIds)
      : recurring
        ? draftFromRecurring(recurring, orderedIds)
        : defaultDraft(model.activeMembers.map((m) => m.id))
  );
  const [repeat, setRepeat] = useState(presetRepeat);
  const [submitted, setSubmitted] = useState(false);

  const amountCents = amount.amountCents;
  const evaluation = useMemo(() => evaluateSplit(mode, draft, amountCents, orderedIds), [mode, draft, amountCents, orderedIds]);
  const shareOf = useMemo(() => new Map((evaluation.shares ?? []).map((s) => [s.memberId, s.cents])), [evaluation.shares]);
  const recents = useMemo(() => (editing || recurring ? [] : recentTemplates(model.expenses)), [editing, recurring, model.expenses]);

  const pending = save.isPending || saveRecurring.isPending;
  const canSubmit = amountCents > 0 && !amount.amountInvalid && !amount.convInvalid && !evaluation.error && !pending && !!paidById;

  // --- Подсказки ---
  const onDescription = (v: string) => {
    setDescription(v);
    if (!categoryTouched.current) {
      const hint = suggestCategory(v);
      if (hint) setCategory(hint);
    }
  };

  const applyRecent = (r: ReturnType<typeof recentTemplates>[number]) => {
    setDescription(r.description);
    setCategory(r.category);
    categoryTouched.current = true;
    if (orderedIds.includes(r.paidById)) setPaidById(r.paidById);
    const sharers = r.shares.map((s) => s.memberId).filter((id) => orderedIds.includes(id));
    if (r.splitMode === "equal" || r.splitMode === "exact") {
      // Точные суммы от прошлой траты к новой сумме не подходят — берём круг людей, делим поровну
      setMode("equal");
      setDraft((d) => ({ ...d, selected: sharers.length ? sharers : d.selected }));
    } else {
      setMode(r.splitMode);
      setDraft(draftFromExpense({ splitMode: r.splitMode, shares: r.shares }, orderedIds));
    }
  };

  // --- Режимы деления ---
  const switchMode = (next: SplitMode) => {
    if (next === mode) return;
    setDraft((d) => {
      const selected = orderedIds.filter((id) => d.selected.includes(id));
      if (next === "exact" && !orderedIds.some((id) => (d.exact[id] ?? "").trim())) {
        return { ...d, exact: exactFromEqual(amountCents, selected) };
      }
      if (next === "shares") {
        return { ...d, weights: Object.fromEntries(orderedIds.map((id) => [id, selected.includes(id) ? Math.max(d.weights[id] ?? 0, 1) : 0])) };
      }
      if (next === "percent") {
        const pct = evenPercents(selected.length);
        const map: Record<string, string> = Object.fromEntries(orderedIds.map((id) => [id, ""]));
        selected.forEach((id, i) => (map[id] = bpToInput(pct[i])));
        return { ...d, percents: map };
      }
      return d;
    });
    setMode(next);
  };

  const toggleSelected = (id: string) =>
    setDraft((d) => ({ ...d, selected: d.selected.includes(id) ? d.selected.filter((x) => x !== id) : [...d.selected, id] }));

  const setWeight = (id: string, delta: number) =>
    setDraft((d) => ({ ...d, weights: { ...d.weights, [id]: Math.min(9, Math.max(0, (d.weights[id] ?? 0) + delta)) } }));

  // --- Отправка ---
  const submit = async () => {
    setSubmitted(true);
    if (amountCents <= 0) {
      if (amount.foreign && amount.typedCents > 0) {
        // Курса нет, а своей суммы в валюте группы ещё не вписали
        toast.error(`Укажи сумму в ${group.currency}`, { description: "Курс недоступен — впиши пересчёт вручную" });
        document.getElementById("split-converted")?.focus();
      } else {
        toast.error("Введи сумму");
        document.getElementById("split-amount")?.focus();
      }
      return;
    }
    if (!canSubmit) return;
    const finalDescription = description.trim() || SPLIT_CATEGORIES[category]?.label || "Трата";
    const form: ExpenseForm = {
      amountCents,
      original: amount.original,
      description: finalDescription,
      category,
      paidById,
      spentOn,
      note: note.trim() || null,
      splitMode: mode,
      split: evaluation.items,
    };
    try {
      if (recurring) {
        await saveRecurring.mutateAsync({
          id: recurring.id,
          form: {
            description: finalDescription,
            category,
            amountCents,
            original: amount.original,
            paidById,
            splitMode: mode,
            split: evaluation.items,
            dayOfMonth,
            startsOn: recurring.startsOn,
            endsOn: recurring.endsOn,
          },
        });
        toast.success("Повтор обновлён", { description: "Новые условия — для будущих периодов; созданные траты не менялись" });
        onDone();
        return;
      }
      if (!editing && repeat) {
        await saveRecurring.mutateAsync({
          form: {
            description: finalDescription,
            category,
            amountCents,
            original: amount.original,
            paidById,
            splitMode: mode,
            split: evaluation.items,
            dayOfMonth: Number(spentOn.slice(8, 10)),
            startsOn: spentOn,
          },
        });
        toast.success("Повторяющаяся трата создана 🔁", {
          description: recurrenceHint(Number(spentOn.slice(8, 10)), spentOn, today),
        });
        onDone();
        return;
      }
      const saved = await save.mutateAsync({ id: editing?.id, form });
      if (editing) {
        toast.success("Изменения сохранены");
      } else {
        const mine = evaluation.shares?.find((s) => s.memberId === group.myMemberId)?.cents ?? 0;
        const owedToMe = paidById === group.myMemberId ? amountCents - mine : 0;
        const description =
          owedToMe > 0
            ? `Тебе должны ${formatCents(owedToMe, group.currency)}`
            : paidById !== group.myMemberId && mine > 0
              ? `Твоя доля ${formatCents(mine, group.currency)}`
              : undefined;
        toast.success("Трата добавлена", {
          description,
          action: { label: "Отменить", onClick: () => del.mutate(saved.id) },
          duration: 6000,
        });
      }
      onDone();
    } catch (err) {
      toast.error("Не удалось сохранить", { description: err instanceof Error ? err.message : "Попробуй ещё раз" });
      // Форму не закрываем: введённое остаётся на месте
    }
  };

  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateKey(d);
  }, []);

  return (
    <div className="space-y-4 pt-1">
      {/* Вносить можно в любую свою группу, не выходя из формы (только для новой траты) */}
      {!editing && !recurring && <GroupPicker currentId={group.id} />}

      {/* Сумма — сразу в фокусе и крупно; валюту можно сменить: пересчёт в валюту группы появится под полем */}
      <AmountFieldView field={amount} groupCurrency={group.currency} autoFocus={!editing && !recurring} />

      <div>
        <input
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="Что это? (необязательно)"
          maxLength={200}
          enterKeyHint="done"
          className={inputClass}
        />
        {recents.length > 0 && !description && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2 -mx-1 px-1" aria-label="Как в прошлый раз">
            {recents.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => applyRecent(r)}
                className="shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-colors"
              >
                <span aria-hidden>{SPLIT_CATEGORIES[r.category]?.emoji ?? "💸"}</span>
                {r.description}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Категория */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Категория</div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          {Object.entries(SPLIT_CATEGORIES).map(([key, c]) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => {
                categoryTouched.current = true;
                setCategory(key);
              }}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border text-sm font-medium transition-colors active:scale-95",
                category === key
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              )}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Кто заплатил */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Кто заплатил</div>
        <div className="flex gap-1.5 flex-wrap">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={paidById === p.id}
              onClick={() => setPaidById(p.id)}
              className={cn(
                "inline-flex items-center gap-1.5 pl-1.5 pr-3 min-h-10 rounded-full text-sm font-medium transition-colors active:scale-95",
                paidById === p.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-background border border-input hover:bg-accent"
              )}
            >
              <MemberAvatar member={p} className="size-7" />
              {p.id === group.myMemberId ? "Я" : p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Как делим */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Как делим</div>
        <Segmented value={mode} onChange={switchMode} options={MODE_OPTIONS} size="sm" />

        <div className="mt-2 rounded-xl border border-input bg-background p-1">
          {people.map((p) => {
            const share = shareOf.get(p.id);
            const row = (
              <>
                <MemberAvatar member={p} className="size-7" />
                <span className="flex-1 min-w-0 text-left truncate">
                  {p.id === group.myMemberId ? `${p.name} (я)` : p.name}
                  {p.status !== "active" && <span className="ml-1.5 text-[10px] text-muted-foreground">вышел</span>}
                </span>
              </>
            );
            if (mode === "equal") {
              const on = draft.selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSelected(p.id)}
                  className={cn("w-full flex items-center gap-2.5 px-2 min-h-12 rounded-lg text-sm transition-colors active:scale-[0.99]", on && "bg-primary/10")}
                >
                  <span className={cn("size-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors", on ? "bg-primary border-primary" : "border-input")}>
                    {on && <Check className="size-3 text-primary-foreground" />}
                  </span>
                  {row}
                  {on && share !== undefined && <span className="text-sm tabular-nums text-muted-foreground">{formatCents(share, group.currency)}</span>}
                </button>
              );
            }
            return (
              <div key={p.id} className="flex items-center gap-2.5 px-2 min-h-12 text-sm">
                {row}
                {mode === "exact" && (
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Сумма для ${p.name}`}
                    value={draft.exact[p.id] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, exact: { ...d.exact, [p.id]: e.target.value } }))}
                    placeholder="0"
                    className="w-24 text-right rounded-lg border border-input bg-card px-2 py-1.5 tabular-nums input-mobile"
                  />
                )}
                {mode === "percent" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Процент для ${p.name}`}
                      value={draft.percents[p.id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, percents: { ...d.percents, [p.id]: e.target.value } }))}
                      placeholder="0"
                      className="w-16 text-right rounded-lg border border-input bg-card px-2 py-1.5 tabular-nums input-mobile"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                )}
                {mode === "shares" && (
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Меньше" onClick={() => setWeight(p.id, -1)} className="size-9 rounded-lg bg-secondary grid place-items-center active:scale-90 transition-transform">
                      <Minus className="size-4" />
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{draft.weights[p.id] ?? 0}</span>
                    <button type="button" aria-label="Больше" onClick={() => setWeight(p.id, 1)} className="size-9 rounded-lg bg-secondary grid place-items-center active:scale-90 transition-transform">
                      <Plus className="size-4" />
                    </button>
                  </div>
                )}
                {mode !== "exact" && share !== undefined && (
                  <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">{formatCents(share, group.currency)}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Итог деления: что получилось или чего не хватает */}
        <SplitSummary mode={mode} amountCents={amountCents} count={evaluation.items.length} evaluation={evaluation} currency={group.currency} />
      </div>

      {/* Шаблон повтора: вместо даты — число месяца */}
      {recurring && (
        <div>
          <label htmlFor="split-day" className="text-xs text-muted-foreground mb-1 block">
            Повторять каждого месяца
          </label>
          <select
            id="split-day"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile min-h-11"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}-го числа{d >= 29 ? " (в коротком месяце — в последний день)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Дата */}
      {!recurring && (
      <div>
        <div className="text-xs text-muted-foreground mb-1">Когда</div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {[
            { key: today, label: "Сегодня" },
            { key: yesterday, label: "Вчера" },
          ].map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={spentOn === d.key && !customDate}
              onClick={() => {
                setSpentOn(d.key);
                setCustomDate(false);
              }}
              className={cn(
                "min-h-10 px-4 rounded-full text-sm font-medium border transition-colors active:scale-95",
                spentOn === d.key && !customDate ? "bg-primary/10 border-primary/40" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {d.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={customDate || (spentOn !== today && spentOn !== yesterday)}
            onClick={() => setCustomDate(true)}
            className={cn(
              "min-h-10 px-4 rounded-full text-sm font-medium border transition-colors active:scale-95",
              customDate || (spentOn !== today && spentOn !== yesterday) ? "bg-primary/10 border-primary/40" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {customDate || (spentOn !== today && spentOn !== yesterday) ? spentOn.split("-").reverse().join(".") : "Другая дата"}
          </button>
          {(customDate || (spentOn !== today && spentOn !== yesterday)) && (
            <input type="date" value={spentOn} max={today} onChange={(e) => e.target.value && setSpentOn(e.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 text-sm input-mobile min-h-10" />
          )}
        </div>
      </div>

      )}

      {/* Заметка и повтор */}
      {!recurring && (
      <div className="space-y-2">
        {noteOpen ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка: чек, кто что брал…"
            maxLength={500}
            rows={2}
            className={cn(inputClass, "resize-none text-sm")}
          />
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-primary font-medium min-h-9 active:scale-95 transition-transform">
            <StickyNote className="size-4" /> Добавить заметку
          </button>
        )}

        {!editing && (
          <button
            type="button"
            role="switch"
            aria-checked={repeat}
            onClick={() => setRepeat((v) => !v)}
            className={cn("w-full flex items-center gap-3 rounded-xl border px-3 min-h-12 text-left transition-colors", repeat ? "border-primary/40 bg-primary/5" : "border-border")}
          >
            <Repeat className={cn("size-4 shrink-0", repeat ? "text-primary" : "text-muted-foreground")} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">Повторять каждый месяц</span>
              <span className="block text-[11px] text-muted-foreground">
                {repeat
                  ? `${recurrenceHint(Number(spentOn.slice(8, 10)), spentOn, today)}${amount.foreign ? `. Сумма в ${group.currency} каждый раз по курсу ${amount.currency} на день создания` : ""}`
                  : "Аренда, интернет, подписки — создаются сами"}
              </span>
            </span>
            <span className={cn("w-10 h-6 rounded-full p-0.5 transition-colors shrink-0", repeat ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("block size-5 rounded-full bg-white shadow transition-transform", repeat && "translate-x-4")} />
            </span>
          </button>
        )}
      </div>
      )}

      <StickySubmit>
        {submitted && evaluation.error && <p className="text-xs text-destructive mb-1.5">{evaluation.error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-disabled={!canSubmit}
          className={cn(
            "w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 transition-[transform,opacity] active:scale-[0.98]",
            canSubmit ? "bg-primary text-primary-foreground" : "bg-primary/40 text-primary-foreground/80"
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : editing || recurring ? <Check className="size-4" /> : <Plus className="size-4" />}
          {editing || recurring ? "Сохранить" : repeat ? "Создать повтор" : "Добавить"}
          {amountCents > 0 && ` · ${formatCents(amountCents, group.currency)}`}
        </button>
      </StickySubmit>
    </div>
  );
}

function SplitSummary({
  mode,
  amountCents,
  count,
  evaluation,
  currency,
}: {
  mode: SplitMode;
  amountCents: number;
  count: number;
  evaluation: ReturnType<typeof evaluateSplit>;
  currency: string;
}) {
  if (amountCents <= 0) return null;
  let text: string | null = null;
  let bad = false;
  if (mode === "equal" && evaluation.shares && count > 0) {
    const first = evaluation.shares[0].cents;
    const even = evaluation.shares.every((s) => s.cents === first);
    text = count === 1 ? "Только на одного — долгов не будет" : `${even ? "По" : "≈"} ${formatCents(first, currency)} с каждого`;
  } else if (mode === "exact" && evaluation.remainingCents !== null) {
    const r = evaluation.remainingCents;
    bad = r !== 0;
    text = r === 0 ? "Всё распределено" : r > 0 ? `Осталось распределить ${formatCents(r, currency)}` : `Перебор на ${formatCents(-r, currency)}`;
  } else if (mode === "percent" && evaluation.percentBp !== null) {
    const bp = evaluation.percentBp;
    bad = bp !== 10000;
    text = bp === 10000 ? "Ровно 100%" : `Сумма ${bp / 100}% — нужно 100%`;
  } else if (mode === "shares" && evaluation.error) {
    bad = true;
    text = evaluation.error;
  }
  if (!text && evaluation.error) {
    bad = true;
    text = evaluation.error;
  }
  if (!text) return null;
  return (
    <p className={cn("mt-1.5 text-xs px-1", bad ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} role="status">
      {text}
    </p>
  );
}

/** Чип «куда вносим»: при двух и более группах — переключатель. Смена группы пересобирает экран (там своя форма, свои участники). */
function GroupPicker({ currentId }: { currentId: string }) {
  const router = useRouter();
  const { data: groups } = useSplitGroups();
  if (!groups || groups.length < 2) return null;
  return (
    <label className="relative flex items-center gap-2 rounded-xl bg-muted/50 px-3 min-h-11 text-sm">
      <span className="text-xs text-muted-foreground shrink-0">Группа</span>
      <select
        value={currentId}
        onChange={(e) => e.target.value !== currentId && router.replace(`/split/${e.target.value}?add=1`)}
        aria-label="В какую группу вносим трату"
        className="flex-1 min-w-0 appearance-none bg-transparent font-semibold focus:outline-none py-2 truncate input-mobile"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.emoji} {g.name}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground text-xs" aria-hidden>
        ▾
      </span>
    </label>
  );
}
