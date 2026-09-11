import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

// GET /api/admin/journal?target=user — журнал действий админов (свежие сверху)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const target = new URL(req.url).searchParams.get("target");
  const items = await db.adminLog.findMany({
    where: target ? { targetType: target } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      targetLabel: true,
      meta: true,
      createdAt: true,
      admin: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(items);
}
