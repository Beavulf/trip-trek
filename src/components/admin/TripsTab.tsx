"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Copy, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { plural } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Stamp } from "./shared";

interface AdminTripRow {
  id: string;
  title: string;
  destination: string;
  coverColor: string;
  coverEmoji: string;
  status: string;
  startDate: string;
  totalDays: number;
  currency: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  totalBudget: number;
  _count: { members: number; places: number; photos: number; expenses: number; journals: number };
}

const TRIP_STATUS: Record<string, { label: string; color: string }> = {
  planning: { label: "Планируется", color: "#0ea5e9" },
  active: { label: "В пути", color: "#10b981" },
  completed: { label: "Завершена", color: "#94a3b8" },
};

export function TripsTab() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminTripRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: trips, isLoading } = useQuery<AdminTripRow[]>({
    queryKey: ["admin-trips", q],
    queryFn: async () => {
      const r = await fetch(`/api/admin/trips${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (!r.ok) throw new Error("fetch trips failed");
      return r.json();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/trips?id=${id}`, { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось удалить");
    },
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["admin-trips"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Поездка удалена");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Название или направление…"
          className="w-full min-h-11 rounded-2xl border border-border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !trips?.length ? (
        <div className="py-16 text-center space-y-2">
          <div className="text-4xl">🧭</div>
          <p className="text-sm text-muted-foreground">{q ? "Ничего не нашли по запросу" : "Поездок пока нет"}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {trips.map((t, i) => {
            const status = TRIP_STATUS[t.status] || TRIP_STATUS.planning;
            return (
              <motion.button
                key={t.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => setSelected(t)}
                className="w-full relative rounded-2xl bg-card border border-border overflow-hidden text-left hover:bg-accent/40 transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: t.coverColor }} />
                <div className="flex items-center gap-3 p-3 pl-4">
                  <span
                    className="size-11 rounded-xl grid place-items-center text-xl shrink-0"
                    style={{ background: `${t.coverColor}22` }}
                  >
                    {t.coverEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">{t.title}</span>
                      <Stamp label={status.label} color={status.color} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.destination} · {t.totalDays} {plural(t.totalDays, "день", "дня", "дней")}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
                      {t._count.members} уч. · {t._count.places} мест · {t._count.photos} фото ·{" "}
                      {t._count.expenses} трат
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Детали поездки */}
      <MobileBottomSheet
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        title={selected?.title || ""}
        titleIcon={<span>{selected?.coverEmoji}</span>}
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Направление", value: selected.destination },
                { label: "Статус", value: (TRIP_STATUS[selected.status] || TRIP_STATUS.planning).label },
                { label: "Длительность", value: `${selected.totalDays} ${plural(selected.totalDays, "день", "дня", "дней")}` },
                { label: "Старт", value: new Date(selected.startDate).toLocaleDateString("ru-RU") },
                { label: "Бюджет", value: `${selected.totalBudget} ${selected.currency}` },
                { label: "Участники", value: String(selected._count.members) },
              ].map((row) => (
                <div key={row.label} className="rounded-xl bg-secondary/50 p-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{row.label}</div>
                  <div className="text-sm font-semibold mt-0.5 truncate">{row.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border divide-y divide-border">
              {[
                { label: "Места", value: selected._count.places },
                { label: "Фото", value: selected._count.photos },
                { label: "Траты", value: selected._count.expenses },
                { label: "Записи дневника", value: selected._count.journals },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.value}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(selected.inviteCode);
                  toast.success("Код приглашения скопирован");
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-accent/50 transition-colors"
              >
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  Код приглашения <Copy className="size-3.5" />
                </span>
                <span className="font-mono font-bold text-xs uppercase tracking-widest">{selected.inviteCode}</span>
              </button>
            </div>

            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-12 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              Удалить поездку
            </button>
          </div>
        )}

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent className="max-w-sm rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить «{selected?.title}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Вместе с поездкой исчезнут дни, места, фото, траты и дневники всех участников —{" "}
                {selected?._count.members} {plural(selected?._count.members || 0, "человек", "человека", "человек")} это
                потеряют. Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="mt-0 rounded-xl">Оставить</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmDelete(false);
                  if (selected) remove.mutate(selected.id);
                }}
                className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              >
                {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MobileBottomSheet>
    </>
  );
}
