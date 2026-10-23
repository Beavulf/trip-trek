"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readLastGroup } from "@/lib/split/last-group";
import { useSplitGroups } from "@/hooks/split/use-split";
import { GroupScreen } from "./group-screen";
import { SplitShell } from "./split-shell";

/**
 * /split/add — группа с уже открытой формой траты. Какую группу показать:
 *  1) запомненная (cookie) — сразу, не дожидаясь списка групп: загрузка группы и списка идут параллельно;
 *  2) если её нет в списке (вышли/удалили) или нет доступа — самая недавняя по активности;
 *  3) групп нет — хаб с приглашением создать первую.
 */
export function QuickAdd() {
  const router = useRouter();
  const groupsQ = useSplitGroups();
  const groups = groupsQ.data;
  const [last, setLast] = useState<string | null>(() => readLastGroup());

  const lastKnown = !groups || groups.some((g) => g.id === last);
  const target = last && lastKnown ? last : (groups?.[0]?.id ?? null);

  useEffect(() => {
    if (groups && groups.length === 0) router.replace("/split?all=1");
  }, [groups, router]);

  const dropLast = useCallback(() => setLast(null), []);

  if (!target) {
    return (
      <SplitShell title="Новая трата" backHref="/split?all=1">
        <div className="space-y-3" aria-busy="true" aria-label="Загрузка">
          <div className="h-24 rounded-3xl bg-muted animate-pulse" />
          <div className="h-16 rounded-2xl bg-muted animate-pulse" />
        </div>
      </SplitShell>
    );
  }
  return <GroupScreen key={target} groupId={target} quickAdd onNoAccess={dropLast} />;
}
