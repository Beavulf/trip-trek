import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// POST /api/user/upgrade — активировать Premium
export async function POST(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;
  const body = await req.json();
  const { userId, plan } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (plan !== "trip" && plan !== "yearly") {
    return NextResponse.json({ error: "invalid plan type" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // Устанавливаем план и дату истечения
  const now = new Date();
  let planExpiry: Date;

  if (plan === "trip") {
    // Premium на 1 поездку = 30 дней (хватит на планирование + поездку)
    planExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else {
    // Premium на 1 год
    planExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      plan: "premium",
      planExpiry,
    },
    select: {
      id: true,
      name: true,
      email: true,
      emoji: true,
      color: true,
      plan: true,
      planExpiry: true,
    },
  });

  return NextResponse.json({
    ...updated,
    isPremium: true,
    planExpiry: planExpiry.toISOString(),
    message: plan === "trip" ? "Premium на поездку активирован!" : "Premium на год активирован!",
  });
}
