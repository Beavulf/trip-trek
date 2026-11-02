"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Copy, ExternalLink, Phone, Plus } from "lucide-react";
import { useInfo, type InfoItem } from "@/hooks/use-trip";
import { findCallTargets, findUrl, groupReference, REFERENCE_PRESETS, type ReferencePreset } from "@/lib/info-page";
import { copyText } from "@/components/trip/lodging/stay-actions";
import { ReferenceDetailSheet, ReferenceFormSheet } from "./ReferenceSheets";

export function ReferenceSection({ canEdit }: { canEdit: boolean }) {
  const { data: items, isLoading, error, refetch } = useInfo();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ item?: InfoItem; preset?: ReferencePreset } | null>(null);

  const list = useMemo(() => items ?? [], [items]);
  const groups = useMemo(() => groupReference(list), [list]);
  const detail = detailId ? list.find((i) => i.id === detailId) ?? null : null;

  if (error && !items) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
        <AlertCircle className="size-6 mx-auto text-destructive" aria-hidden="true" />
        <p className="text-sm">Не удалось загрузить справку</p>
        <button type="button" onClick={() => refetch()} className="min-h-11 rounded-lg bg-primary px-3 text-xs text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }

  if (isLoading || !items) {
    return <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" />;
  }

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <h2 className="text-base font-semibold">Что пригодится в дороге</h2>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              Номера, адреса и подсказки, которые нужны внезапно. Они останутся на телефоне и без интернета, если хотя бы раз открыть этот раздел.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-1.5">
              {REFERENCE_PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => setForm({ preset: p })}
                  className="min-h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-accent"
                >
                  + {p.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Пока здесь пусто.</p>
          )}
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="min-w-0 text-xs text-pretty text-muted-foreground">Номера и подсказки в дороге. Работают и без интернета.</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setForm({})}
              className="min-h-11 shrink-0 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <Plus className="size-4" aria-hidden="true" /> Добавить
            </button>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.type} className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={g.label}>
          <h3 className="flex min-h-11 items-center gap-2.5 border-b border-border/60 px-4 text-sm font-semibold">
            <span aria-hidden="true">{g.emoji}</span> {g.label}
          </h3>
          <div className="divide-y divide-border/60">
            {g.items.map((item) => (
              <ReferenceRow key={item.id} item={item} onOpen={() => setDetailId(item.id)} />
            ))}
          </div>
        </section>
      ))}

      {detail && (
        <ReferenceDetailSheet
          key={detail.id}
          item={detail}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ item: detail })}
        />
      )}
      {form && <ReferenceFormSheet key={form.item?.id ?? "new"} item={form.item} preset={form.preset} onClose={() => setForm(null)} />}
    </div>
  );
}

function ReferenceRow({ item, onOpen }: { item: InfoItem; onOpen: () => void }) {
  const calls = findCallTargets(item);
  const url = findUrl(item.content);
  return (
    <div className="px-1 py-1">
      <div className="flex items-start">
        <button type="button" onClick={onOpen} className="min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-accent/50">
          <span className="block text-sm font-medium break-words">{item.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2 break-words">{item.content}</span>
        </button>
        {calls.length === 0 &&
          (url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть ссылку: ${item.title}`}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => copyText(`${item.title}\n${item.content}`, "Скопировано")}
              aria-label={`Скопировать: ${item.title}`}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
            >
              <Copy className="size-4" aria-hidden="true" />
            </button>
          ))}
      </div>
      {/* Звонок в одно касание: в экстренном случае открывать карточку некогда */}
      {calls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
          {calls.map((c) => (
            <a
              key={c.number}
              href={`tel:${c.number}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              {c.number}
              {c.label && <span className="text-xs font-normal opacity-80">{c.label}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
