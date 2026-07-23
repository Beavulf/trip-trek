"use client";

import {
  useChecklist,
  useToggleChecklist,
  useAddChecklist,
  useDeleteChecklist,
  useInfo,
  type ChecklistItem,
} from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Plane,
  Phone,
  Train,
  Utensils,
  Lightbulb,
  Loader2,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CHECKLIST_CATS: Record<string, { label: string; emoji: string; color: string }> = {
  documents: { label: "Документы", emoji: "📄", color: "#ef4444" },
  health: { label: "Здоровье", emoji: "💊", color: "#10b981" },
  preparation: { label: "Подготовка", emoji: "🎒", color: "#f59e0b" },
};

const INFO_TABS = [
  { key: "tip", label: "Советы", icon: Lightbulb, color: "#f59e0b" },
  { key: "contact", label: "Контакты", icon: Phone, color: "#ef4444" },
  { key: "transport", label: "Транспорт", icon: Train, color: "#06b6d4" },
  { key: "food", label: "Еда", icon: Utensils, color: "#f97316" },
] as const;

export function InfoPanel() {
  const [tab, setTab] = useState<"checklist" | "info">("checklist");

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
          <p className="text-white/80 text-sm mt-1">Чек-лист, контакты, транспорт и советы</p>
        </div>
      </div>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-card border border-border rounded-2xl">
        <button
          onClick={() => setTab("checklist")}
          className={cn(
            "rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all",
            tab === "checklist" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <ClipboardList className="size-4" /> Чек-лист
        </button>
        <button
          onClick={() => setTab("info")}
          className={cn(
            "rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all",
            tab === "info" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Plane className="size-4" /> Справка
        </button>
      </div>

      {tab === "checklist" ? <ChecklistView /> : <InfoView />}
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
    if (!newItem.trim()) return;
    await add.mutateAsync({ text: newItem, category: newCat });
    setNewItem("");
    toast.success("Добавлено в чек-лист");
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
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Новый пункт…"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <select
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-2 text-xs"
          >
            {Object.entries(CHECKLIST_CATS).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={add.isPending || !newItem.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-3 grid place-items-center disabled:opacity-50"
          >
            <Plus className="size-4" />
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
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent group"
    >
      <button onClick={onToggle} className="shrink-0">
        {item.done ? (
          <CheckCircle2 className="size-5 text-green-500" />
        ) : (
          <Circle className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>
      <span className={cn("text-sm flex-1", item.done && "line-through opacity-50")}>{item.text}</span>
      <button
        onClick={onDelete}
        className="size-6 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-opacity"
      >
        <Trash2 className="size-3.5" />
      </button>
    </motion.div>
  );
}

function InfoView() {
  const [activeType, setActiveType] = useState<string>("tip");
  const { data: items, isLoading } = useInfo(activeType);

  return (
    <div className="space-y-3">
      {/* Подтабы */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {INFO_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeType === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                active ? "text-white shadow-md" : "bg-card border border-border hover:bg-accent"
              )}
              style={active ? { background: t.color } : undefined}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : items && items.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((item) => {
            const tabMeta = INFO_TABS.find((t) => t.key === item.type);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-card border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="size-10 rounded-xl grid place-items-center text-xl shrink-0"
                    style={{ background: `${tabMeta?.color}22` }}
                  >
                    {item.icon || tabMeta?.icon ? (
                      <span className="text-xl">{item.icon}</span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm leading-tight">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.content}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Нет данных</p>
        </div>
      )}
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
