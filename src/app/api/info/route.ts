import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/info
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const items = await db.infoItem.findMany({
    where: type ? { type } : undefined,
    orderBy: [{ type: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(items);
}
