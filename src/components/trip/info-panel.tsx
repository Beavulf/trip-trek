"use client";

import {
  useChecklist,
  useToggleChecklist,
  useAddChecklist,
  useDeleteChecklist,
  type ChecklistItem,
  useInfo,
  useAddInfo,
  useDeleteInfo,
  type InfoItem,
} from "@/hooks/use-trip";
import { useTrip } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Pencil,
  Phone,
  Car,
  UtensilsCrossed,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DataBackup } from "./data-backup";
import { PushSettings } from "./push-settings";

const CHECKLIST_CATS: Record<string, { label: string; emoji: string; color: string }> = {
  documents: { label: "Документы", emoji: "📄", color: "#ef4444" },
  health: { label: "Здоровье", emoji: "💊", color: "#10b981" },
  preparation: { label: "Подготовка", emoji: "🎒", color: "#f59e0b" },
  packing_there: { label: "Сборы туда", emoji: "🧳", color: "#8b5cf6" },
  packing_back: { label: "Сборы обратно", emoji: "↩️", color: "#06b6d4" },
};

// P1 #7: InfoItem types — neutral labels (not China-centric)
const INFO_TYPES: Record<string, { label: string; emoji: string; color: string }> = {
  contact: { label: "Контакты", emoji: "📞", color: "#06b6d4" },
  transport: { label: "Транспорт", emoji: "🚇", color: "#0ea5e9" },
  food: { label: "Еда", emoji: "🍽️", color: "#f97316" },
  tip: { label: "Советы", emoji: "💡", color: "#eab308" },
};

export function InfoPanel() {
  const { data: trip, error: tripError } = useTrip();

  // P0 #6: error state
  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">📋</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <ShieldCheck className="size-4" /> Инфо и подготовка
          </div>
          <h1 className="text-2xl font-bold">Всё для спокойной поездки</h1>
          <p className="text-white/80 text-sm mt-1">
            Чек-лист, контакты и подготовка
            {trip?.settings.title && <span className="text-white/60"> · {trip.settings.title}</span>}
          </p>
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

function ChecklistView() {
  const { data: items, isLoading, error: itemsError } = useChecklist();
  const toggle = useToggleChecklist();
  const del = useDeleteChecklist();
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState("preparation");
  const add = useAddChecklist();

  // P0 #6: error state
  if (itemsError) {
    return (
      <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-red-500" />
        <p className="text-sm text-red-500">Не удалось загрузить чек-лист</p>
        <button onClick={() => window.location.reload()} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading) return <Skeleton />;

  const grouped = Object.keys(CHECKLIST_CATS).map((cat) => ({
    cat,
    meta: CHECKLIST_CATS[cat],
    items: (items ?? []).filter((i) => i.category === cat),
  }));

  const done = (items ?? []).filter((i) => i.done).length;
  const total = (items ?? []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

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

  return (
    <div className="space-y-3">
      {/* Прогресс */}
      {total > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Готовность к поездке</span>
            <span className="text-sm font-bold text-primary tabular-nums">{done}/{total} · {pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500"
            />
          </div>
        </div>
      )}

      {/* Добавить */}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !add.isPending) submit();
          }}
          placeholder="Новый пункт…"
          maxLength={200}
          className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            aria-label="Категория чек-листа"
            className="min-w-0 flex-1 min-h-[44px] rounded-lg border border-input bg-background px-2 py-2.5 text-xs"
          >
            {Object.entries(CHECKLIST_CATS).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={add.isPending || !newItem.trim()}
            aria-label="Добавить пункт в чек-лист"
            className="shrink-0 min-h-[44px] rounded-lg bg-primary text-primary-foreground px-4 grid place-items-center disabled:opacity-50 active:scale-95 transition-transform"
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </button>
        </div>
      </div>

      {/* По категориям — P2 #16: схлопываем пустые */}
      {grouped.filter((g) => g.items.length > 0).length === 0 ? (
        // P0 #6: empty state
        <div className="rounded-2xl border-2 border-dashed border-border py-8 text-center">
          <CheckCircle2 className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Чек-лист пуст</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Добавьте первый пункт выше</p>
        </div>
      ) : (
        grouped.filter((g) => g.items.length > 0).map(({ cat, meta, items: catItems }) => (
          <div key={cat} className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{meta.emoji}</span>
              <h2 className="font-semibold text-sm" style={{ color: meta.color }}>{meta.label}</h2>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {catItems.filter((i) => i.done).length}/{catItems.length}
              </span>
            </div>
            <div className="space-y-1">
              <AnimatePresence>
                {catItems.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggle.mutate(
                      { id: item.id, done: !item.done },
                      { onError: (err) => toast.error("Не удалось обновить", { description: err instanceof Error ? err.message : "" }) }
                    )}
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
        ))
      )}
    </div>
  );
}

// P1 #9: confirm delete on checklist items
function ChecklistRow({ item, onToggle, onDelete }: { item: ChecklistItem; onToggle: () => void; onDelete: (id: string) => Promise<void> }) {
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
        onClick={onToggle}
        disabled={update.isPending}
        aria-label={item.done ? "Снять отметку" : "Отметить как выполненное"}
        className="shrink-0 size-9 grid place-items-center disabled:opacity-50"
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
                className="min-h-[32px] min-w-[32px] text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium"
              >
                Да
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                aria-label="Отменить удаление"
                className="min-h-[32px] min-w-[32px] text-[10px] bg-secondary px-2 py-1 rounded-lg"
              >
                Нет
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Удалить пункт"
              className="size-9 shrink-0 rounded-md hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

// P1 #7: Minimal InfoItem UI (was API+hooks but no UI)
function InfoView() {
  const { data: items, isLoading, error: itemsError } = useInfo();
  const add = useAddInfo();
  const del = useDeleteInfo();
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState("contact");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  if (itemsError) {
    return (
      <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-red-500" />
        <p className="text-sm text-red-500">Не удалось загрузить справку</p>
      </div>
    );
  }

  const grouped = Object.keys(INFO_TYPES).map((t) => ({
    type: t,
    meta: INFO_TYPES[t],
    items: (items ?? []).filter((i) => i.type === t),
  })).filter((g) => g.items.length > 0);

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Заполните заголовок и текст");
      return;
    }
    try {
      await add.mutateAsync({ type, title: title.trim(), content: content.trim() });
      toast.success("Добавлено в справку");
      setTitle(""); setContent(""); setType("contact");
      setShowAdd(false);
    } catch (err) {
      toast.error("Не удалось добавить", { description: err instanceof Error ? err.message : "" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success("Удалено");
    } catch (err) {
      toast.error("Не удалось удалить", { description: err instanceof Error ? err.message : "" });
    }
  };

  return (
    <div className="space-y-3">
      {/* Заголовок + кнопка добавить */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Phone className="size-4" /> Справка поездки
        </h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          aria-label="Добавить запись в справку"
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1"
        >
          <Plus className="size-3" /> Добавить
        </button>
      </div>

      {/* Форма добавления */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Тип записи"
                className="w-full min-h-[40px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(INFO_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Заголовок (например, Экстренный номер)"
                maxLength={200}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Текст…"
                rows={2}
                maxLength={2000}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={handleAdd}
                disabled={add.isPending}
                className="w-full min-h-[40px] rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50"
              >
                {add.isPending ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Добавить запись"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Список по типам */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Загрузка…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-8 text-center">
          <Lightbulb className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Справка пуста</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Добавьте контакты, транспорт, советы</p>
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
                <InfoItemCard key={item.id} item={item} onDelete={() => handleDelete(item.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function InfoItemCard({ item, onDelete }: { item: InfoItem; onDelete: () => Promise<void> }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="rounded-lg bg-muted/30 p-2.5 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{item.title}</div>
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{item.content}</p>
        </div>
        {confirmingDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={async () => { await onDelete(); setConfirmingDelete(false); }}
              aria-label="Подтвердить удаление"
              className="min-h-[32px] text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium"
            >
              Да
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              aria-label="Отменить удаление"
              className="min-h-[32px] text-[10px] bg-secondary px-2 py-1 rounded-lg"
            >
              Нет
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            aria-label="Удалить запись"
            className="size-8 shrink-0 rounded-md hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
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
