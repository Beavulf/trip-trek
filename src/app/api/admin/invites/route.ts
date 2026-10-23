import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { generateInviteCode } from "@/lib/invite-code";

// Инвайт-коды приложения (бета-доступ). Удаления кодов нет — только деактивация:
// на код смотрят регистрации, и связь User.inviteCodeId (SetNull) не должна
// оказываться в подвешенном состоянии из панели

// GET /api/admin/invites — список кодов, новые сверху
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const codes = await db.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ codes });
}

// POST /api/admin/invites — сгенерировать пачку: { count ≤ 100, maxUses ≤ 1000, expiresAt?, note? }
export async function POST(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const count = Number(body.count);
  const maxUses = Number(body.maxUses ?? 1);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 100) : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "count: целое 1–100" }, { status: 400 });
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
    return NextResponse.json({ error: "maxUses: целое 1–1000" }, { status: 400 });
  }
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now())) {
    return NextResponse.json({ error: "expiresAt: дата в будущем" }, { status: 400 });
  }

  // Коллизия случайного 8-символьного кода практически исключена, но уникальный
  // индекс никто не отменял — пару перегенераций оставляем
  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const exists = await db.inviteCode.findUnique({ where: { code }, select: { id: true } });
      if (exists) continue;
      await db.inviteCode.create({ data: { code, note, maxUses, expiresAt, createdBy: admin!.id } });
      created.push(code);
      break;
    }
  }

  await logAdmin(admin!.id, "invite.create", { type: "invite", label: note ?? "коды" }, {
    count: created.length,
    maxUses,
    expiresAt: expiresAt?.toISOString() ?? null,
  });

  return NextResponse.json({ codes: created });
}
