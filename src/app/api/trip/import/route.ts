import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// POST /api/trip/import — импорт поездки из JSON-бэкапа (формат backup v2.0)
// Создаёт НОВУЮ поездку для текущего пользователя (owner). Все userId-ссылки
// в expenses/photos/journals/messages заменяются на текущего пользователя.
// Все cuid в бэкапе заменяются на новые, чтобы не конфликтовать с существующими.

interface BackupV2 {
  app: string;
  trip: {
    id?: string;
    title: string;
    destination?: string;
    startDate: string;
    endDate?: string | null;
    totalDays: number;
    totalBudget: number;
    currency: string;
    inviteCode?: string;
    coverColor?: string;
    coverEmoji?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  days: Array<{
    id?: string;
    tripId?: string;
    dayNumber: number;
    date: string;
    city: string;
    cityKey: string;
    title: string;
    summary?: string | null;
    accentColor?: string | null;
  }>;
  places: Array<{
    id?: string;
    tripId?: string;
    name: string;
    description?: string | null;
    category: string;
    lat: number;
    lng: number;
    dayId?: string;
    timeOfDay?: string | null;
    status?: string;
    budget?: number | null;
    address?: string | null;
    notes?: string | null;
    rating?: number | null;
    visitedAt?: string | null;
    order?: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
  photos?: Array<{
    id?: string;
    tripId?: string;
    url: string;
    thumbUrl?: string | null;
    caption?: string | null;
    placeId?: string | null;
    dayId?: string;
    userId?: string | null;
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    takenAt?: string;
    createdAt?: string;
  }>;
  expenses?: Array<{
    id?: string;
    tripId?: string;
    amount: number;
    category: string;
    description: string;
    paidById?: string;
    dayId?: string | null;
    splitWith?: string;
    excludeSelf?: boolean;
    settlementKey?: string | null;
    createdAt?: string;
  }>;
  journals?: Array<{
    id?: string;
    tripId?: string;
    dayId?: string;
    userId?: string | null;
    mood?: string | null;
    content: string;
    createdAt?: string;
  }>;
  messages?: Array<{
    id?: string;
    tripId?: string;
    content: string;
    userId?: string | null;
    pinned?: boolean;
    createdAt?: string;
  }>;
  checklist?: Array<{
    id?: string;
    tripId?: string;
    text: string;
    category?: string;
    done?: boolean;
    order?: number;
    createdAt?: string;
  }>;
  info?: Array<{
    id?: string;
    tripId?: string;
    type: string;
    title: string;
    content: string;
    icon?: string | null;
    order?: number;
    createdAt?: string;
  }>;
  phrases?: Array<{
    id?: string;
    tripId?: string;
    category: string;
    ru: string;
    cn: string;
    pinyin: string;
    audio?: string | null;
    favorite?: boolean;
    order?: number;
    createdAt?: string;
  }>;
  foods?: Array<{
    id?: string;
    tripId?: string;
    name: string;
    nameCn?: string | null;
    description?: string;
    city?: string;
    place?: string | null;
    price?: string | null;
    emoji?: string | null;
    imageUrl?: string | null;
    tried?: boolean;
    rating?: number | null;
    order?: number;
    createdAt?: string;
  }>;
  budgetPlans?: Array<{
    id?: string;
    tripId?: string;
    category: string;
    amount: number;
  }>;
}

export async function POST(req: NextRequest) {
  const { user: authUser, response } = await requireUser(req);
  if (response) return response;
  const userId = authUser!.id;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, emoji: true, color: true },
  });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  let body: BackupV2;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.trip?.title || !Array.isArray(body?.days)) {
    return NextResponse.json({ error: "invalid backup format" }, { status: 400 });
  }

  // Создаём новую поездку и текущего пользователя как owner-участника
  const trip = await db.trip.create({
    data: {
      title: body.trip.title,
      destination: body.trip.destination || "Unknown",
      startDate: new Date(body.trip.startDate),
      endDate: body.trip.endDate ? new Date(body.trip.endDate) : null,
      totalDays: body.trip.totalDays || body.days.length,
      totalBudget: body.trip.totalBudget ?? 0,
      currency: body.trip.currency || "USD",
      coverColor: body.trip.coverColor || "#f97316",
      coverEmoji: body.trip.coverEmoji || "🌏",
      status: body.trip.status || "active",
      members: {
        create: {
          userId,
          role: "owner",
          displayName: user.name,
          emoji: user.emoji,
          color: user.color,
        },
      },
    },
  });

  // Карта старый dayId → новый dayId
  const dayIdMap = new Map<string, string>();

  // 1) Дни
  for (const d of body.days) {
    const newDay = await db.day.create({
      data: {
        tripId: trip.id,
        dayNumber: d.dayNumber,
        date: new Date(d.date),
        city: d.city,
        cityKey: d.cityKey,
        title: d.title,
        summary: d.summary || null,
        accentColor: d.accentColor || null,
      },
    });
    if (d.id) dayIdMap.set(d.id, newDay.id);
  }

  // 2) Места (placeId пока не сохраняем — нам важны координаты, день, имя)
  for (const p of body.places || []) {
    const newDayId = p.dayId ? dayIdMap.get(p.dayId) : null;
    if (!newDayId) continue; // пропускаем места без привязки к дню
    await db.place.create({
      data: {
        tripId: trip.id,
        dayId: newDayId,
        name: p.name,
        description: p.description || null,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        timeOfDay: p.timeOfDay || null,
        status: p.status || "planned",
        budget: p.budget ?? null,
        address: p.address || null,
        notes: p.notes || null,
        rating: p.rating ?? null,
        visitedAt: p.visitedAt ? new Date(p.visitedAt) : null,
        order: p.order ?? 0,
      },
    });
  }

  // 3) Фото — url валиден только как внутренний /uploads/-путь этого
  //    инстанса (тогда файл реально существует и отрендерится); внешние
  //    и произвольные url не переносим — фото без файла не создаем.
  for (const ph of body.photos || []) {
    const newDayId = ph.dayId ? dayIdMap.get(ph.dayId) : null;
    if (!newDayId) continue;
    if (typeof ph.url !== "string" || !ph.url.startsWith("/uploads/")) continue;
    await db.photo.create({
      data: {
        tripId: trip.id,
        dayId: newDayId,
        url: ph.url,
        thumbUrl: (typeof ph.thumbUrl === "string" && ph.thumbUrl.startsWith("/uploads/") && ph.thumbUrl) || null,
        caption: ph.caption || null,
        lat: ph.lat ?? null,
        lng: ph.lng ?? null,
        address: ph.address || null,
        userId,
        takenAt: ph.takenAt ? new Date(ph.takenAt) : new Date(),
      },
    });
  }

  // 4) Траты — paidById → текущий пользователь
  for (const ex of body.expenses || []) {
    const newDayId = ex.dayId ? dayIdMap.get(ex.dayId) : null;
    await db.expense.create({
      data: {
        tripId: trip.id,
        amount: ex.amount,
        category: ex.category,
        description: ex.description,
        paidById: userId,
        dayId: newDayId || null,
        splitWith: ex.splitWith || "",
        excludeSelf: !!ex.excludeSelf,
      },
    });
  }

  // 5) Записи дневника
  for (const j of body.journals || []) {
    const newDayId = j.dayId ? dayIdMap.get(j.dayId) : null;
    if (!newDayId) continue;
    await db.journalEntry.create({
      data: {
        tripId: trip.id,
        dayId: newDayId,
        userId,
        mood: j.mood || null,
        content: j.content,
      },
    });
  }

  // 6) Сообщения на доске
  for (const m of body.messages || []) {
    await db.boardMessage.create({
      data: {
        tripId: trip.id,
        content: m.content,
        userId,
        pinned: !!m.pinned,
      },
    });
  }

  // 7) Чек-лист
  for (const c of body.checklist || []) {
    await db.checklistItem.create({
      data: {
        tripId: trip.id,
        text: c.text,
        category: c.category || "preparation",
        done: !!c.done,
        order: c.order ?? 0,
      },
    });
  }

  // 8) Инфо-блоки
  for (const inf of body.info || []) {
    await db.infoItem.create({
      data: {
        tripId: trip.id,
        type: inf.type,
        title: inf.title,
        content: inf.content,
        icon: inf.icon || null,
        order: inf.order ?? 0,
      },
    });
  }

  // 9) Фразы разговорника
  for (const p of body.phrases || []) {
    await db.phrase.create({
      data: {
        tripId: trip.id,
        category: p.category,
        ru: p.ru,
        cn: p.cn,
        pinyin: p.pinyin,
        audio: p.audio || null,
        favorite: !!p.favorite,
        order: p.order ?? 0,
      },
    });
  }

  // 10) Блюда
  for (const f of body.foods || []) {
    await db.foodItem.create({
      data: {
        tripId: trip.id,
        name: f.name,
        nameCn: f.nameCn || null,
        description: f.description || "",
        city: f.city || "",
        place: f.place || null,
        price: f.price || null,
        emoji: f.emoji || null,
        // Картинка блюда валидна только как /uploads/-путь этого инстанса
        imageUrl: (typeof f.imageUrl === "string" && f.imageUrl.startsWith("/uploads/") && f.imageUrl) || null,
        tried: !!f.tried,
        rating: f.rating ?? null,
        order: f.order ?? 0,
      },
    });
  }

  // 11) Планы бюджета
  for (const b of body.budgetPlans || []) {
    await db.budgetPlan.upsert({
      where: { tripId_category: { tripId: trip.id, category: b.category } },
      update: { amount: b.amount },
      create: { tripId: trip.id, category: b.category, amount: b.amount },
    });
  }

  return NextResponse.json({ ok: true, tripId: trip.id, title: trip.title });
}
