import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { getAppConfig } from "@/lib/app-config";
import { AI_FEATURES, utcMidnight, type AiFeature } from "@/lib/ai-usage";

// GET /api/admin/ai — статистика ИИ для раздела «ИИ» в штабе.
// Паттерн как в /api/admin/stats: минимальные выборки за окно, группировка в JS.

const FEATURES = Object.keys(AI_FEATURES) as AiFeature[];

export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const midnight = utcMidnight();
  const weekStart = new Date(midnight.getTime() - 6 * 86_400_000);
  const since14d = new Date(midnight.getTime() - 13 * 86_400_000);

  const [rows, recent, thresholds] = await Promise.all([
    db.aiUsage.findMany({
      where: { createdAt: { gte: since14d } },
      select: {
        userId: true,
        feature: true,
        keySource: true,
        promptTokens: true,
        completionTokens: true,
        createdAt: true,
      },
    }),
    db.aiUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        feature: true,
        keySource: true,
        model: true,
        promptTokens: true,
        completionTokens: true,
        durationMs: true,
        ok: true,
        error: true,
        tripId: true,
        user: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
      },
    }),
    getAppConfig(),
  ]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  // ── Суточные ряды по фичам (нулевая сетка 14 дней, UTC) ──
  const byDay = new Map<string, Map<string, { calls: number; tokens: number }>>();
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(midnight.getTime() - i * 86_400_000));
    const per = new Map<string, { calls: number; tokens: number }>();
    for (const f of FEATURES) per.set(f, { calls: 0, tokens: 0 });
    byDay.set(key, per);
  }
  // ── Per-user агрегаты (7 дней и сегодня) + тоталы ──
  const perUser = new Map<string, { callsToday: number; tokensToday: number; calls7d: number; tokens7d: number; keySource: string; lastUsedAt: Date }>();
  const todayUsers = new Set<string>();
  let todayCalls = 0;
  let todayTokens = 0;
  let weekCalls = 0;
  let weekTokens = 0;

  for (const r of rows) {
    const tokens = r.promptTokens + r.completionTokens;
    const isToday = r.createdAt >= midnight;
    const isWeek = r.createdAt >= weekStart;

    if (isToday) {
      todayCalls += 1;
      todayTokens += tokens;
      todayUsers.add(r.userId);
    }
    if (isWeek) {
      weekCalls += 1;
      weekTokens += tokens;
    }
    const day = byDay.get(dayKey(r.createdAt));
    if (day) {
      const cell = day.get(r.feature) ?? { calls: 0, tokens: 0 };
      cell.calls += 1;
      cell.tokens += tokens;
      day.set(r.feature, cell);
    }

    if (isWeek) {
      const u = perUser.get(r.userId) ?? {
        callsToday: 0,
        tokensToday: 0,
        calls7d: 0,
        tokens7d: 0,
        keySource: r.keySource,
        lastUsedAt: r.createdAt,
      };
      u.calls7d += 1;
      u.tokens7d += tokens;
      if (isToday) {
        u.callsToday += 1;
        u.tokensToday += tokens;
      }
      if (r.createdAt >= u.lastUsedAt) {
        u.lastUsedAt = r.createdAt;
        u.keySource = r.keySource; // источник последнего вызова — «чей баланс горел»
      }
      perUser.set(r.userId, u);
    }
  }

  const series14d = [...byDay.entries()].map(([date, per]) => {
    const calls: Record<string, number> = {};
    const tokens: Record<string, number> = {};
    let totalCalls = 0;
    let totalTokens = 0;
    for (const f of FEATURES) {
      const cell = per.get(f) ?? { calls: 0, tokens: 0 };
      calls[f] = cell.calls;
      tokens[f] = cell.tokens;
      totalCalls += cell.calls;
      totalTokens += cell.tokens;
    }
    return { date, calls, tokens, totalCalls, totalTokens };
  });

  // ── Таблица юзеров: топ по активности за неделю, с флагами порога/блока ──
  const userIds = [...perUser.keys()];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, emoji: true, color: true, avatarUrl: true, aiBlocked: true, aiAlertedAt: true },
      })
    : [];
  const callsLimit = thresholds.aiAlertCallsPerDay;
  const tokensLimit = thresholds.aiAlertTokensPerDay;
  const userRows = users
    .map((u) => {
      const agg = perUser.get(u.id)!;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        emoji: u.emoji,
        color: u.color,
        avatarUrl: u.avatarUrl,
        aiBlocked: u.aiBlocked,
        alertedToday: Boolean(u.aiAlertedAt && u.aiAlertedAt >= midnight),
        callsToday: agg.callsToday,
        tokensToday: agg.tokensToday,
        calls7d: agg.calls7d,
        tokens7d: agg.tokens7d,
        keySource: agg.keySource,
        lastUsedAt: agg.lastUsedAt.toISOString(),
        overThreshold:
          (callsLimit > 0 && agg.callsToday > callsLimit) || (tokensLimit > 0 && agg.tokensToday > tokensLimit),
      };
    })
    .sort((a, b) => b.callsToday - a.callsToday || b.calls7d - a.calls7d)
    .slice(0, 25);

  return NextResponse.json({
    today: { calls: todayCalls, tokens: todayTokens, users: todayUsers.size },
    week: { calls: weekCalls, tokens: weekTokens },
    series14d,
    thresholds: { calls: callsLimit, tokens: tokensLimit },
    users: userRows,
    recent,
  });
}
