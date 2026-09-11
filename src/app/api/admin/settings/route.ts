import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { maskKey } from "@/lib/ai-key";

// GET /api/admin/settings — глобальные настройки (ключ ИИ наружу не отдаётся,
// только факт наличия и замаскированный хвост)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { aiApiKey: true },
  });

  return NextResponse.json({
    aiKeyTail: settings?.aiApiKey ? maskKey(settings.aiApiKey) : null,
  });
}

// PUT /api/admin/settings — задать/убрать общий ключ ИИ.
// { aiApiKey: "sk-..." } — установить; { aiApiKey: null } — убрать
export async function PUT(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { aiApiKey } = body as { aiApiKey?: string | null };

  const data: { aiApiKey?: string | null } =
    aiApiKey === null
      ? { aiApiKey: null }
      : typeof aiApiKey === "string" && aiApiKey.trim()
        ? { aiApiKey: aiApiKey.trim() }
        : {};

  if (!("aiApiKey" in data)) {
    return NextResponse.json({ error: "aiApiKey required (string or null)" }, { status: 400 });
  }

  await db.appSettings.upsert({
    where: { id: "app" },
    update: data,
    create: { id: "app", aiApiKey: data.aiApiKey ?? null },
  });

  return NextResponse.json({
    ok: true,
    aiKeyTail: data.aiApiKey ? maskKey(data.aiApiKey) : null,
  });
}
