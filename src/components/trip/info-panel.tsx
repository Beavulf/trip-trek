"use client";

import {
  useChecklist,
  useToggleChecklist,
  useAddChecklist,
  useDeleteChecklist,
  type ChecklistItem,
} from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Pencil,
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

export function InfoPanel() {
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
          <p className="text-white/80 text-sm mt-1">Чек-лист и подготовка к путешествию</p>
        </div>
      </div>

      <ChecklistView />

      {/* Push-уведомления */}
      <PushSettings />

      {/* Резервное копирование */}
      <DataBackup />
    </div>
  );
}

function ChecklistView() {
  const { data: items, isLoading } = useChecklist();
  const toggle = useToggleChecklist();
  const del = useDeleteChecklist();
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState("preparation");
  const add = useAddChecklist();

  if (isLoading) return <Skeleton />;

  const grouped = CHECKLIST_CATS && Object.keys(CHECKLIST_CATS).map((cat) => ({
    cat,
    meta: CHECKLIST_CATS[cat],
    items: (items ?? []).filter((i) => i.category === cat),
  }));

  const done = (items ?? []).filter((i) => i.done).length;
  const total = (items ?? []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const submit = async () => {
    const text = newItem.trim();
    if (!text) return;
    try {
      await add.mutateAsync({ text, category: newCat });
      setNewItem("");
      toast.success("Добавлено в чек-лист");
    } catch {
      toast.error("Не удалось добавить пункт");
    }
  };

  return (
    <div className="space-y-3">
      {/* Прогресс */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Готовность к поездке</span>
          <span className="text-sm font-bold text-primary">{done}/{total} · {pct}%</span>
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

      {/* Добавить */}
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Новый пункт…"
          className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-2.5 text-xs"
          >
            {Object.entries(CHECKLIST_CATS).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={add.isPending || !newItem.trim()}
            className="shrink-0 min-h-[44px] rounded-lg bg-primary text-primary-foreground px-4 grid place-items-center disabled:opacity-50 active:scale-95 transition-transform"
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </button>
        </div>
      </div>

      {/* По категориям */}
      {grouped.map(({ cat, meta, items: catItems }) => (
        <div key={cat} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{meta.emoji}</span>
            <h2 className="font-semibold text-sm" style={{ color: meta.color }}>{meta.label}</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {catItems.filter((i) => i.done).length}/{catItems.length}
            </span>
          </div>
          <div className="space-y-1">
            <AnimatePresence>
              {catItems.map((item) => (
                <ChecklistRow key={item.id} item={item} onToggle={() => toggle.mutate({ id: item.id, done: !item.done })} onDelete={() => { del.mutate(item.id); toast.success("Удалено"); }} />
              ))}
            </AnimatePresence>
            {catItems.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic py-2">Пусто</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistRow({ item, onToggle, onDelete }: { item: ChecklistItem; onToggle: () => void; onDelete: () => void }) {
  const update = useToggleChecklist();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  const save = () => {
    if (text.trim() && text !== item.text) {
      update.mutate({ id: item.id, text: text.trim() });
      toast.success("Обновлено");
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
      <button onClick={onToggle} className="shrink-0 size-8 grid place-items-center" aria-label="Отметить">
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
            className="size-8 shrink-0 rounded-md hover:bg-accent grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label="Редактировать"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="size-8 shrink-0 rounded-md hover:bg-red-500/10 hover:text-red-500 grid place-items-center text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label="Удалить"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </motion.div>
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
