import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { resolveAiConfig } from "@/lib/ai-key";

// GET /api/ai/status — работают ли ИИ-функции у текущего пользователя: есть ли ключ (свой, админский
// или из env) и не заблокирован ли ИИ админом. Ключ и адрес наружу не отдаём — только факт и источник.
// Нужен интерфейсу, чтобы заранее показать «подключите свой ключ», а не ловить ошибку после нажатия.
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const cfg = await resolveAiConfig(user!.id);
  return NextResponse.json({
    available: Boolean(cfg.key) && !cfg.aiBlocked,
    blocked: cfg.aiBlocked,
    source: cfg.source,
  });
}
