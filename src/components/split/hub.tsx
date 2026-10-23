"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Scale, Users } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import { formatCents } from "@/lib/split/money";
import { normalizeInviteCode } from "@/lib/split/invite";
import type { SplitGroupSummaryDTO } from "@/lib/split/types";
import { useAuth } from "@/hooks/use-auth";
import { useSplitGroups } from "@/hooks/split/use-split";
import { useSplitSocket } from "@/hooks/split/use-split-socket";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { CreateGroupSheet } from "./create-group-sheet";
import { SplitShell } from "./split-shell";
import { AvatarStack, EmptyState, PrimaryButton, SecondaryButton, balanceTone, inputClass } from "./ui";

function GroupCard({ g }: { g: SplitGroupSummaryDTO }) {
  const b = g.myBalanceCents;
  return (
    <Link
      href={`/split/${g.id}`}
      className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3.5 min-h-[76px] hover:border-primary/40 active:scale-[0.99] transition-[transform,border-color]"
    >
      <span className="size-12 rounded-2xl grid place-items-center text-2xl shrink-0" style={{ background: `${g.color}26` }} aria-hidden>
        {g.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate">{g.name}</span>
        <span className="mt-1 flex items-center gap-2">
          <AvatarStack members={g.members} total={g.memberCount} size="size-5" />
          <span className="text-[11px] text-muted-foreground">
            {g.memberCount} {plural(g.memberCount, "участник", "участника", "участников")}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn("block text-sm font-bold tabular-nums", balanceTone(b))}>{b === 0 ? "ровно" : formatCents(b, g.currency, { sign: true })}</span>
        <span className="block text-[11px] text-muted-foreground">{b > 0 ? "тебе должны" : b < 0 ? "ты должен(на)" : "всё в расчёте"}</span>
      </span>
    </Link>
  );
}

/** Сводка по всем группам: «тебе должны / ты должен» отдельно по каждой валюте. */
function Totals({ groups }: { groups: SplitGroupSummaryDTO[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { owed: number; owe: number }>();
    for (const g of groups) {
      const r = map.get(g.currency) ?? { owed: 0, owe: 0 };
      if (g.myBalanceCents > 0) r.owed += g.myBalanceCents;
      else r.owe += -g.myBalanceCents;
      map.set(g.currency, r);
    }
    return [...map.entries()];
  }, [groups]);
  const allEven = rows.every(([, r]) => r.owed === 0 && r.owe === 0);

  return (
    <section className="rounded-3xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/15" aria-label="Мои расчёты">
      <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
        <Scale className="size-4" aria-hidden /> Мои расчёты
      </div>
      {allEven ? (
        <p className="mt-2 text-2xl font-bold">Всё в расчёте 🎉</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {rows.map(([currency, r]) => (
            <div key={currency} className="flex flex-wrap gap-x-6 gap-y-1">
              {r.owed > 0 && (
                <div>
                  <div className="text-[11px] text-white/75">Тебе должны</div>
                  <div className="text-2xl font-bold tabular-nums">{formatCents(r.owed, currency)}</div>
                </div>
              )}
              {r.owe > 0 && (
                <div>
                  <div className="text-[11px] text-white/75">Ты должен(на)</div>
                  <div className="text-2xl font-bold tabular-nums">{formatCents(r.owe, currency)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function JoinByCodeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const go = () => {
    const c = normalizeInviteCode(code);
    if (c.length < 4) return;
    onOpenChange(false);
    router.push(`/split/join?code=${encodeURIComponent(c)}`);
  };
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Вступить по коду" maxWidthClass="sm:max-w-sm">
      <div className="space-y-4 pt-1">
        <p className="text-sm text-muted-foreground">Попроси у друга код приглашения (8 символов) или открой его ссылку.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="ABCD2345"
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Код приглашения"
          className={cn(inputClass, "text-center text-xl font-bold tracking-[0.2em] uppercase")}
        />
        <StickySubmit>
          <PrimaryButton className="w-full min-h-12" onClick={go} disabled={normalizeInviteCode(code).length < 4}>
            Найти группу
          </PrimaryButton>
        </StickySubmit>
      </div>
    </MobileBottomSheet>
  );
}

export function SplitHub() {
  const { data: session } = useAuth();
  const { data: groups, isLoading, isError, refetch } = useSplitGroups();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const ids = useMemo(() => (groups ?? []).map((g) => g.id), [groups]);
  useSplitSocket(ids, session?.user?.id);

  // Одна группа — хаб лишний шаг: открываем её сразу. Явный заход в хаб (`?all=1`, «назад» из группы) не трогаем.
  // Когда группа уже открывалась, это делает middleware по cookie; здесь — самый первый вход
  const [explicitHub] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("all"));
  const onlyGroup = !explicitHub && groups?.length === 1 ? groups[0].id : null;
  useEffect(() => {
    if (onlyGroup) router.replace(`/split/${onlyGroup}`);
  }, [onlyGroup, router]);

  return (
    <SplitShell title="Сочтёмся" subtitle="общие траты с друзьями">
      {isLoading || onlyGroup ? (
        <div className="space-y-3" aria-busy="true" aria-label="Загрузка">
          <div className="h-32 rounded-3xl bg-muted animate-pulse" />
          {[0, 1].map((i) => (
            <div key={i} className="h-[76px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState emoji="🤔" title="Не удалось загрузить группы">
          <SecondaryButton onClick={() => refetch()}>Обновить</SecondaryButton>
        </EmptyState>
      ) : groups && groups.length > 0 ? (
        <div className="space-y-4">
          <Totals groups={groups} />
          <div className="flex gap-2">
            <PrimaryButton className="flex-1" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Новая группа
            </PrimaryButton>
            <SecondaryButton className="flex-1" onClick={() => setJoinOpen(true)}>
              <KeyRound className="size-4" /> По коду
            </SecondaryButton>
          </div>
          <ul className="space-y-2.5">
            {groups.map((g) => (
              <li key={g.id}>
                <GroupCard g={g} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-3xl p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/15 text-center">
            <div className="text-5xl" aria-hidden>
              🧾
            </div>
            <h2 className="mt-2 text-xl font-bold">Делите траты без споров</h2>
            <p className="mt-1 text-sm text-white/85 max-w-xs mx-auto">Квартира, продукты, интернет, поход в кафе — записывай, кто за что заплатил, а долги посчитаются сами.</p>
          </section>
          <ol className="space-y-2.5 text-sm">
            {[
              ["👥", "Создай группу и пригласи друзей по ссылке"],
              ["🧾", "Вноси траты: поровну, по долям или точными суммами"],
              ["✅", "Смотри, кто кому должен, и отмечай переводы"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3">
                <span className="text-xl" aria-hidden>
                  {icon}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <PrimaryButton className="flex-1 min-h-12" onClick={() => setCreateOpen(true)}>
              <Users className="size-4" /> Создать группу
            </PrimaryButton>
            <SecondaryButton className="flex-1 min-h-12" onClick={() => setJoinOpen(true)}>
              <KeyRound className="size-4" /> У меня есть код
            </SecondaryButton>
          </div>
        </div>
      )}
      <CreateGroupSheet open={createOpen} onOpenChange={setCreateOpen} />
      <JoinByCodeSheet open={joinOpen} onOpenChange={setJoinOpen} />
    </SplitShell>
  );
}
