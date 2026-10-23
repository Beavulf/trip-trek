import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { activityDTO } from "@/lib/split/serialize";

type Ctx = { params: Promise<{ groupId: string }> };

const PAGE = 30;

// GET /api/split/groups/[groupId]/activity?before=<ISO> — журнал, новые сверху, постранично (курсор — createdAt последней).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const { response } = await requireGroupMember(req, groupId);
  if (response) return response;

  const beforeRaw = new URL(req.url).searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const rows = await db.splitActivity.findMany({
    where: { groupId, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
  });
  const page = rows.slice(0, PAGE);
  return NextResponse.json({
    items: page.map(activityDTO),
    nextBefore: rows.length > PAGE ? page[page.length - 1].createdAt.toISOString() : null,
  });
}
