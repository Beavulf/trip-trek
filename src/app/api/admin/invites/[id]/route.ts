import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";

// PATCH /api/admin/invites/[id] — вкл/выкл кода: { deactivatedAt: boolean }
// (дату сервер ставит сам — клиент передаёт только факт выключения)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.deactivatedAt !== "boolean") {
    return NextResponse.json({ error: "deactivatedAt: boolean (выключить/включить)" }, { status: 400 });
  }

  const code = await db.inviteCode.update({
    where: { id },
    data: { deactivatedAt: body.deactivatedAt ? new Date() : null },
  });

  await logAdmin(admin!.id, "invite.deactivate", { type: "invite", id, label: code.code }, {
    deactivated: Boolean(code.deactivatedAt),
  });

  return NextResponse.json({ code });
}
