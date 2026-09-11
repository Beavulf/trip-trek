import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// GET /api/feedback/mine — свои обращения со статусами и ответами админа
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const items = await db.feedback.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      message: true,
      status: true,
      adminReply: true,
      repliedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(items);
}
