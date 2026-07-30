import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/user?userId=... — получить профиль пользователя со статистикой
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

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
    },
  });

  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // Статистика: считаем через связи
  const [tripMembers, photos, expenses, journals, messages] = await Promise.all([
    db.tripMember.count({ where: { userId } }),
    db.photo.count({ where: { userId } }),
    db.expense.findMany({ where: { paidById: userId }, select: { amount: true } }),
    db.journalEntry.count({ where: { userId } }),
    db.boardMessage.count({ where: { userId } }),
  ]);

  // Поездки с деталями
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
  const visitedPlaces = trips.reduce((sum, t) => sum + t.places, 0);

  // Достижения (бейджи)
  const achievements: { emoji: string; label: string; unlocked: boolean }[] = [];
  if (trips.length >= 1) achievements.push({ emoji: "🌏", label: "Первое путешествие", unlocked: true });
  if (trips.length >= 3) achievements.push({ emoji: "🗺️", label: "Исследователь", unlocked: true });
  if (trips.length >= 5) achievements.push({ emoji: "✈️", label: "Глобал-тревелер", unlocked: true });
  if (photos >= 10) achievements.push({ emoji: "📸", label: "Фотограф", unlocked: true });
  if (photos >= 50) achievements.push({ emoji: "🎬", label: "Папарацци", unlocked: true });
  if (journals >= 5) achievements.push({ emoji: "📔", label: "Дневник", unlocked: true });
  if (journals >= 20) achievements.push({ emoji: "✍️", label: "Летописец", unlocked: true });
  if (totalSpent >= 100) achievements.push({ emoji: "💰", label: "Шопоголик", unlocked: true });
  if (totalSpent >= 1000) achievements.push({ emoji: "💎", label: "Тяжеловес", unlocked: true });
  if (messages >= 10) achievements.push({ emoji: "💬", label: "Болтун", unlocked: true });
  if (messages >= 50) achievements.push({ emoji: "📢", label: "Оратор", unlocked: true });
  if (visitedPlaces >= 10) achievements.push({ emoji: "📍", label: "Маршрут", unlocked: true });
  if (user.plan === "premium") achievements.push({ emoji: "👑", label: "Premium", unlocked: true });

  // Заблокированные (не разблокированные) достижения
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
    { emoji: "📍", label: "Маршрут", req: "10 мест" },
    { emoji: "👑", label: "Premium", req: "Premium подписка" },
  ];

  const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());

  // Лимиты freemium
  const ownedTrips = trips.filter((t) => t.role === "owner").length;
  const maxOwnedTrips = isPremium ? null : 1;
  const maxMembersPerTrip = isPremium ? null : 5;

  return NextResponse.json({
    ...user,
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
      unlocked: achievements.some((u) => u.label === a.label),
    })),
  });
}

// PATCH /api/user — обновить профиль (имя, эмодзи, цвет, avatarUrl)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { userId, name, emoji, color, avatarUrl } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof emoji === "string") data.emoji = emoji;
  if (typeof color === "string" && color.match(/^#[0-9a-fA-F]{6}$/)) data.color = color;
  if (typeof avatarUrl === "string") data.avatarUrl = avatarUrl;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, emoji: true, color: true, avatarUrl: true },
  });

  // Обновим также displayName/emoji/color во всех TripMember
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

  return NextResponse.json(user);
}
