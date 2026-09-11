import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { maskKey } from "@/lib/ai-key";

// GET /api/admin/settings — глобальные настройки. Ключ наружу не отдаётся,
// только замаскированный хвост; base URL и модель — не секреты, отдаём как есть
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { aiApiKey: true, aiBaseUrl: true, aiModel: true },
  });

  return NextResponse.json({
    aiKeyTail: settings?.aiApiKey ? maskKey(settings.aiApiKey) : null,
    aiBaseUrl: settings?.aiBaseUrl ?? "",
    aiModel: settings?.aiModel ?? "",
  });
}

// PUT /api/admin/settings — задать/убрать общий ключ ИИ и его провайдера.
// { aiApiKey: "sk-..." | null, aiBaseUrl: "https://…" | "", aiModel: "glm-4.6" | "" }
// Поля независимы: можно поменять базу, не трогая ключ (передав только их).
export async function PUT(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { aiApiKey, aiBaseUrl, aiModel } = body as {
    aiApiKey?: string | null;
    aiBaseUrl?: string | null;
    aiModel?: string | null;
  };

  const data: { aiApiKey?: string | null; aiBaseUrl?: string | null; aiModel?: string | null } = {};

  if (aiApiKey === null) data.aiApiKey = null;
  else if (typeof aiApiKey === "string" && aiApiKey.trim()) data.aiApiKey = aiApiKey.trim();

  if (aiBaseUrl !== undefined) data.aiBaseUrl = typeof aiBaseUrl === "string" && aiBaseUrl.trim() ? aiBaseUrl.trim() : null;
  if (aiModel !== undefined) data.aiModel = typeof aiModel === "string" && aiModel.trim() ? aiModel.trim() : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "ничего не передано" }, { status: 400 });
  }

  const settings = await db.appSettings.upsert({
    where: { id: "app" },
    update: data,
    create: { id: "app", aiApiKey: data.aiApiKey ?? null, aiBaseUrl: data.aiBaseUrl ?? null, aiModel: data.aiModel ?? null },
  });

  return NextResponse.json({
    ok: true,
    aiKeyTail: settings.aiApiKey ? maskKey(settings.aiApiKey) : null,
    aiBaseUrl: settings.aiBaseUrl ?? "",
    aiModel: settings.aiModel ?? "",
  });
}
