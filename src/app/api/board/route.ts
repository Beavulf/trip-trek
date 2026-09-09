import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember, requireUser } from "@/lib/api-auth";

// Хелпер: безопасно разобрать reactions JSON
function parseReactions(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
      }
      return out;
    }
  } catch {
    /* битый JSON — считаем пустым */
  }
  return {};
}

const USER_FIELDS = { id: true, name: true, color: true, emoji: true } as const;
const MSG_INCLUDE = {
  user: { select: USER_FIELDS },
  replyTo: { include: { user: { select: USER_FIELDS } } },
} as const;

// GET /api/board?tripId=... — сообщения по возрастанию времени (чат-поток),
// pinned отдаётся отдельно и в ленте не всплывает (рельса «Закреплённые» в UI)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const messages = await db.boardMessage.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    include: MSG_INCLUDE,
  });
  return NextResponse.json(
    messages.map((m) => ({ ...m, reactions: parseReactions(m.reactions) }))
  );
}

// POST /api/board — новое сообщение (content, tripId, replyToId?)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, tripId, replyToId } = body;
  const { user, response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "content не может быть пустым" }, { status: 400 });
  }
  if (trimmed.length > 4000) {
    return NextResponse.json({ error: "content слишком длинный (макс 4000 символов)" }, { status: 400 });
  }

  // replyToId: цитируемое сообщение должно существовать и belong той же поездке
  let safeReplyToId: string | null = null;
  if (typeof replyToId === "string" && replyToId) {
    const parent = await db.boardMessage.findUnique({
      where: { id: replyToId },
      select: { tripId: true },
    });
    if (parent?.tripId === tripId) safeReplyToId = replyToId;
  }

  const msg = await db.boardMessage.create({
    data: { content: trimmed, userId: user!.id, tripId, replyToId: safeReplyToId },
    include: MSG_INCLUDE,
  });

  await emitWS("board:added", tripId, {
    messageId: msg.id,
    userId: user!.id,
    userName: msg.user?.name || "Кто-то",
    content: trimmed,
  });
  return NextResponse.json({ ...msg, reactions: {} });
}

// PATCH /api/board — три действия одним роутом:
//   { id, pinned }            → закрепить/открепить (любой участник)
//   { id, content }           → редактировать (только автор)
//   { id, reaction: "👍" }    → переключить свою реакцию (любой участник)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pinned, content, reaction } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.boardMessage.findUnique({
    where: { id },
    select: { tripId: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  // 1) Pin
  if (pinned !== undefined) {
    const msg = await db.boardMessage.update({ where: { id }, data: { pinned: !!pinned } });
    await emitWS("board:pinned", existing.tripId, { messageId: id, pinned: !!pinned });
    return NextResponse.json(msg);
  }

  // 2) Редактирование — только автор
  if (content !== undefined) {
    if (existing.userId !== user!.id) {
      return NextResponse.json({ error: "Можно редактировать только свои сообщения" }, { status: 403 });
    }
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "content не может быть пустым" }, { status: 400 });
    if (trimmed.length > 4000) {
      return NextResponse.json({ error: "content слишком длинный (макс 4000 символов)" }, { status: 400 });
    }
    const msg = await db.boardMessage.update({
      where: { id },
      data: { content: trimmed, editedAt: new Date() },
      include: MSG_INCLUDE,
    });
    await emitWS("board:updated", existing.tripId, { messageId: id, userId: user!.id });
    return NextResponse.json({ ...msg, reactions: parseReactions(msg.reactions) });
  }

  // 3) Реакция — любой участник, тогл
  if (typeof reaction === "string" && reaction) {
    const emoji = reaction.slice(0, 8); // защита от мусора
    const current = parseReactions(
      (await db.boardMessage.findUnique({ where: { id }, select: { reactions: true } }))?.reactions
    );
    const set = new Set(current[emoji] || []);
    if (set.has(user!.id)) set.delete(user!.id);
    else set.add(user!.id);
    const next = { ...current };
    if (set.size > 0) next[emoji] = [...set];
    else delete next[emoji];

    const msg = await db.boardMessage.update({
      where: { id },
      data: { reactions: JSON.stringify(next) },
    });
    await emitWS("board:updated", existing.tripId, { messageId: id, userId: user!.id });
    return NextResponse.json({ ...msg, reactions: next });
  }

  return NextResponse.json({ error: "Нечего обновлять: передай pinned, content или reaction" }, { status: 400 });
}

// DELETE /api/board?id=... — автор или владелец поездки
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { user, response: authResp } = await requireUser(req);
  if (authResp) return authResp;

  const existing = await db.boardMessage.findUnique({
    where: { id },
    select: { tripId: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { response: memberResp } = await requireTripMember(req, existing.tripId);
  if (memberResp) return memberResp;

  const membership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId: existing.tripId, userId: user!.id } },
    select: { role: true },
  });
  const isAuthor = existing.userId === user!.id;
  const isOwner = membership?.role === "owner";
  if (!isAuthor && !isOwner) {
    return NextResponse.json({ error: "Можно удалять только свои сообщения" }, { status: 403 });
  }

  const msg = await db.boardMessage.delete({ where: { id } });
  await emitWS("board:deleted", msg.tripId, { messageId: id });
  return NextResponse.json({ ok: true });
}
