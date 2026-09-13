import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { maskKey, validateAiBaseUrl } from "@/lib/ai-key";

// GET /api/user — профиль текущего пользователя (сессия)
export async function GET(req: NextRequest) {
  const { user: authUser, response } = await requireUser(req);
  if (response) return response;
  const userId = authUser!.id;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      emoji: true,
      color: true,
      avatarUrl: true,
      plan: true,
      planExpiry: true,
      createdAt: true,
      // Ключ ИИ наружу не отдаём — ниже превращаем в замаскированный хвост.
      // Адрес и модель — не секреты, возвращаются как есть (для UI профиля).
      aiApiKey: true,
      aiBaseUrl: true,
      aiModel: true,
    },
  });

  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const [photos, expenses, journals, messages, visitedPlaces] = await Promise.all([
    db.photo.count({ where: { userId } }),
    db.expense.findMany({ where: { paidById: userId }, select: { amount: true } }),
    db.journalEntry.count({ where: { userId } }),
    db.boardMessage.count({ where: { userId } }),
    db.place.count({
      where: {
        status: "visited",
        trip: { members: { some: { userId } } },
      },
    }),
  ]);

  const memberships = await db.tripMember.findMany({
    where: { userId },
    include: {
      trip: {
        select: {
          id: true,
          title: true,
          destination: true,
          coverColor: true,
          coverEmoji: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          status: true,
          inviteCode: true,
          _count: {
            select: {
              places: true,
              photos: true,
              expenses: true,
              journals: true,
              members: true,
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const trips = memberships.map((m) => ({
    id: m.trip.id,
    title: m.trip.title,
    destination: m.trip.destination,
    coverColor: m.trip.coverColor,
    coverEmoji: m.trip.coverEmoji,
    startDate: m.trip.startDate,
    endDate: m.trip.endDate,
    totalDays: m.trip.totalDays,
    status: m.trip.status,
    inviteCode: m.trip.inviteCode,
    role: m.role,
    members: m.trip._count.members,
    places: m.trip._count.places,
    photos: m.trip._count.photos,
    expenses: m.trip._count.expenses,
    journals: m.trip._count.journals,
  }));

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const unlocked: { emoji: string; label: string; unlocked: boolean }[] = [];
  if (trips.length >= 1) unlocked.push({ emoji: "🌏", label: "Первое путешествие", unlocked: true });
  if (trips.length >= 3) unlocked.push({ emoji: "🗺️", label: "Исследователь", unlocked: true });
  if (trips.length >= 5) unlocked.push({ emoji: "✈️", label: "Глобал-тревелер", unlocked: true });
  if (photos >= 10) unlocked.push({ emoji: "📸", label: "Фотограф", unlocked: true });
  if (photos >= 50) unlocked.push({ emoji: "🎬", label: "Папарацци", unlocked: true });
  if (journals >= 5) unlocked.push({ emoji: "📔", label: "Дневник", unlocked: true });
  if (journals >= 20) unlocked.push({ emoji: "✍️", label: "Летописец", unlocked: true });
  if (totalSpent >= 100) unlocked.push({ emoji: "💰", label: "Шопоголик", unlocked: true });
  if (totalSpent >= 1000) unlocked.push({ emoji: "💎", label: "Тяжеловес", unlocked: true });
  if (messages >= 10) unlocked.push({ emoji: "💬", label: "Болтун", unlocked: true });
  if (messages >= 50) unlocked.push({ emoji: "📢", label: "Оратор", unlocked: true });
  if (visitedPlaces >= 10) unlocked.push({ emoji: "📍", label: "Маршрут", unlocked: true });
  if (user.plan === "premium") unlocked.push({ emoji: "👑", label: "Premium", unlocked: true });

  const allAchievements = [
    { emoji: "🌏", label: "Первое путешествие", req: "1 поездка" },
    { emoji: "🗺️", label: "Исследователь", req: "3 поездки" },
    { emoji: "✈️", label: "Глобал-тревелер", req: "5 поездок" },
    { emoji: "📸", label: "Фотограф", req: "10 фото" },
    { emoji: "🎬", label: "Папарацци", req: "50 фото" },
    { emoji: "📔", label: "Дневник", req: "5 записей" },
    { emoji: "✍️", label: "Летописец", req: "20 записей" },
    { emoji: "💰", label: "Шопоголик", req: "$100 потрачено" },
    { emoji: "💎", label: "Тяжеловес", req: "$1000 потрачено" },
    { emoji: "💬", label: "Болтун", req: "10 сообщений" },
    { emoji: "📢", label: "Оратор", req: "50 сообщений" },
    { emoji: "📍", label: "Маршрут", req: "10 посещённых мест" },
    { emoji: "👑", label: "Premium", req: "Premium подписка" },
  ];

  const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
  const ownedTrips = trips.filter((t) => t.role === "owner").length;
  const maxOwnedTrips = isPremium ? null : 1;
  const maxMembersPerTrip = isPremium ? null : 5;

  const { aiApiKey, aiBaseUrl, aiModel, ...safeUser } = user;

  return NextResponse.json({
    ...safeUser,
    aiKeyTail: aiApiKey ? maskKey(aiApiKey) : null,
    aiBaseUrl: aiBaseUrl ?? "",
    aiModel: aiModel ?? "",
    isPremium,
    stats: {
      trips: trips.length,
      ownedTrips,
      photos,
      totalSpent: Math.round(totalSpent * 100) / 100,
      journals,
      messages,
      visitedPlaces,
    },
    limits: {
      maxOwnedTrips,
      maxMembersPerTrip,
      canCreateTrip: isPremium || ownedTrips < 1,
    },
    trips,
    achievements: allAchievements.map((a) => ({
      ...a,
      unlocked: unlocked.some((u) => u.label === a.label),
    })),
  });
}

// PATCH /api/user — обновить свой профиль
export async function PATCH(req: NextRequest) {
  const { user: authUser, response } = await requireUser(req);
  if (response) return response;
  const userId = authUser!.id;

  const body = await req.json();
  const { name, emoji, color, avatarUrl, aiApiKey, aiBaseUrl, aiModel, onboardingCompleted } = body;

  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof emoji === "string") data.emoji = emoji;
  if (typeof color === "string" && color.match(/^#[0-9a-fA-F]{6}$/)) data.color = color;
  // avatarUrl: строка — установить фото, null — убрать фото (вернуться к эмодзи).
  // Принимаем только пути аватарок этого инстанса: произвольная строка позже
  // уходила аргументом в storageRemove при следующей загрузке аватара, и через
  // это можно было удалить чужой файл (аудит 2026-09-12).
  if (typeof avatarUrl === "string") {
    if (!avatarUrl.startsWith("/uploads/avatars/avatar-")) {
      return NextResponse.json({ error: "avatarUrl: недопустимый путь" }, { status: 400 });
    }
    data.avatarUrl = avatarUrl;
  }
  if (avatarUrl === null) data.avatarUrl = null;
  // Ключ ИИ (BYOK): строка — установить, null — убрать. Валидация мягкая:
  // ключи бывают разной длины, главное — не логировать и не отдавать наружу.
  // Чистим мусор вставки: проболы/переводы строк внутри, кавычки по краям.
  if (typeof aiApiKey === "string") {
    const cleaned = aiApiKey.trim().replace(/\s+/g, "").replace(/^["'`]+|["'`]+$/g, "");
    if (cleaned) data.aiApiKey = cleaned;
  }
  if (aiApiKey === null) data.aiApiKey = null;
  // Свой адрес провайдера (полный BYOK): та же https-валидация, что в админке —
  // на этот URL сервер ходит с Bearer-ключом. Адрес без своего ключа игнорируется
  // резолвом, но хранить его не запрещаем: ключ могут добавить позже.
  if (aiBaseUrl !== undefined) {
    if (typeof aiBaseUrl === "string" && aiBaseUrl.trim()) {
      const checked = validateAiBaseUrl(aiBaseUrl.trim());
      if (!checked.ok) {
        return NextResponse.json({ error: `aiBaseUrl: ${checked.error}` }, { status: 400 });
      }
      data.aiBaseUrl = checked.value;
    } else {
      data.aiBaseUrl = null;
    }
  }
  if (aiModel !== undefined) {
    const trimmed = typeof aiModel === "string" ? aiModel.trim().slice(0, 120) : "";
    data.aiModel = trimmed || null;
  }
  // Обучение: true — тур пройден или пропущен, false — сброс («Пройти заново» в профиле)
  if (typeof onboardingCompleted === "boolean") {
    data.onboardingCompletedAt = onboardingCompleted ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: userId },
    data,
    // aiApiKey нужен только чтобы отдать маску aiKeyTail — сам ключ наружу не идёт;
    // адрес/модель возвращаем, чтобы UI профиля синхронизировался без перезагрузки
    select: { id: true, name: true, emoji: true, color: true, avatarUrl: true, aiApiKey: true, aiBaseUrl: true, aiModel: true, onboardingCompletedAt: true },
  });

  if (data.name || data.emoji || data.color) {
    const memberUpdate: Record<string, unknown> = {};
    if (data.name) memberUpdate.displayName = data.name;
    if (data.emoji) memberUpdate.emoji = data.emoji;
    if (data.color) memberUpdate.color = data.color;
    await db.tripMember.updateMany({
      where: { userId },
      data: memberUpdate,
    });
  }

  const { aiApiKey: _key, ...safeUser } = user;
  return NextResponse.json({
    ...safeUser,
    // Клиент сразу показывает «Свой ключ подключён (…хвост)» без перезагрузки
    aiKeyTail: _key ? maskKey(_key) : null,
    aiBaseUrl: safeUser.aiBaseUrl ?? "",
    aiModel: safeUser.aiModel ?? "",
    onboardingCompleted: safeUser.onboardingCompletedAt != null,
  });
}
