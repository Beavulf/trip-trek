import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dateToKey, keyToDate } from "./dates";
import { convertCents, type Rates } from "./fx";
import { fetchRates } from "./fx-server";
import { duePeriods } from "./recurrence";
import { computeShares, isSplitMode, scaleShares, type ComputedShare, type SplitItem } from "./split";

// Ленивая материализация повторяющихся трат (ADR-0009): cron нет — при чтении группы создаём недостающие
// траты за наступившие периоды. Идемпотентность держит уникальный (recurringId, recurringPeriod): два
// одновременных клиента не создадут дубль (второй получит P2002 и пропустит период).

function templateItems(raw: unknown): SplitItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = x as { memberId?: unknown; value?: unknown } | null;
    return r && typeof r.memberId === "string"
      ? [{ memberId: r.memberId, value: typeof r.value === "number" ? r.value : null }]
      : [];
  });
}

/** Создаёт недостающие траты. Возвращает число созданных (0 в подавляющем большинстве чтений). */
export async function materializeRecurring(groupId: string, todayKey: string): Promise<number> {
  const recs = await db.splitRecurring.findMany({ where: { groupId, active: true } });
  if (recs.length === 0) return 0;

  const members = await db.splitMember.findMany({ where: { groupId }, select: { id: true, status: true } });
  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
  if (!group) return 0;
  // Курсы нужны только шаблонам в иностранной валюте и только когда есть что создавать — берём лениво, один раз
  let rates: Rates | null | undefined;
  const active = new Set(members.filter((m) => m.status === "active").map((m) => m.id));
  let created = 0;

  for (const rec of recs) {
    const due = duePeriods(
      { dayOfMonth: rec.dayOfMonth, startsOn: dateToKey(rec.startsOn), endsOn: rec.endsOn ? dateToKey(rec.endsOn) : null },
      todayKey
    ).filter((d) => !rec.skippedPeriods.includes(d.period));
    if (due.length === 0) continue;

    const items = templateItems(rec.template);
    const mode = isSplitMode(rec.splitMode) ? rec.splitMode : "equal";
    const computed = computeShares(mode, rec.amountCents, items);
    // Кто-то из шаблона вышел — молча делить на оставшихся нельзя (поменяются доли): ставим на паузу и пишем в журнал
    const intact = computed.ok && active.has(rec.paidById) && items.every((i) => active.has(i.memberId));
    if (!computed.ok || !intact) {
      await db.$transaction([
        db.splitRecurring.update({ where: { id: rec.id }, data: { active: false } }),
        db.splitActivity.create({
          data: { groupId, actorId: null, type: "recurring.paused", data: { recurringId: rec.id, description: rec.description } },
        }),
      ]);
      continue;
    }

    const have = new Set(
      (
        await db.splitExpense.findMany({
          where: { recurringId: rec.id, recurringPeriod: { in: due.map((d) => d.period) } },
          select: { recurringPeriod: true },
        })
      ).map((e) => e.recurringPeriod)
    );

    const missing = due.filter((d) => !have.has(d.period));
    if (missing.length === 0) continue;

    // Шаблон в иностранной валюте (аренда в долларах): сумма в валюте группы — по курсу на момент создания.
    // Нет живых курсов — не создаём вовсе (молча записать долг по устаревшему курсу хуже, чем подождать до следующего чтения)
    let amountCents = rec.amountCents;
    let shares: ComputedShare[] = computed.shares;
    if (rec.originalCurrency && rec.originalAmountCents) {
      if (rates === undefined) rates = await fetchRates();
      const converted = convertCents(rec.originalAmountCents, rec.originalCurrency, group.currency, rates);
      if (!converted || converted <= 0) continue;
      amountCents = converted;
      if (mode === "exact") {
        // Точные суммы привязаны к старой сумме: на новую делим в тех же пропорциях
        shares = scaleShares(computed.shares, converted).map((s) => ({ ...s, weight: null }));
      } else {
        const again = computeShares(mode, converted, items);
        if (!again.ok) continue;
        shares = again.shares;
      }
    }

    for (const d of missing) {
      try {
        await db.$transaction(async (tx) => {
          const expense = await tx.splitExpense.create({
            data: {
              groupId,
              amountCents,
              originalAmountCents: rec.originalAmountCents,
              originalCurrency: rec.originalCurrency,
              description: rec.description,
              category: rec.category,
              paidById: rec.paidById,
              spentOn: keyToDate(d.date),
              splitMode: mode,
              createdById: rec.createdById,
              recurringId: rec.id,
              recurringPeriod: d.period,
              shares: { create: shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })) },
            },
          });
          await tx.splitActivity.create({
            data: {
              groupId,
              actorId: null,
              type: "expense.created",
              data: {
                expenseId: expense.id,
                description: rec.description,
                amountCents,
                category: rec.category,
                recurring: true,
              },
            },
          });
        });
        created += 1;
      } catch (e) {
        // Параллельный запрос успел раньше — период уже есть, это нормально
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        logger.error("split: recurring materialize failed", {
          groupId,
          recurringId: rec.id,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    }
  }
  return created;
}
