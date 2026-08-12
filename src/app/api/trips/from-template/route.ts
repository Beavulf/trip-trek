import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TRIP_TEMPLATES } from "@/lib/trip-templates";
import { requireUser } from "@/lib/api-auth";

// POST /api/trips/from-template — создать поездку из шаблона (owner = session)
export async function POST(req: NextRequest) {
  try {
    const { user: sessionUser, response } = await requireUser(req);
    if (response) return response;

    const body = await req.json();
    const { templateId, displayName, emoji, color, customTitle } = body;
    const userId = sessionUser!.id;

    if (!templateId) {
      return NextResponse.json({ error: "templateId required" }, { status: 400 });
    }

    const template = TRIP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "template not found" }, { status: 404 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
    const maxTrips = isPremium ? Infinity : 1;

    // Create trip with all template data
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + template.totalDays * 24 * 60 * 60 * 1000);

    // Лимит + create в одной транзакции (меньше гонки double-click)
    const trip = await db.$transaction(async (tx) => {
      const tripCount = await tx.tripMember.count({ where: { userId, role: "owner" } });
      if (tripCount >= maxTrips) {
        throw new Error("LIMIT_REACHED");
      }
      return tx.trip.create({
      data: {
        title: customTitle || template.title,
        destination: template.destination,
        startDate,
        endDate,
        totalDays: template.totalDays,
        totalBudget: template.totalBudget,
        coverEmoji: template.coverEmoji,
        coverColor: template.coverColor,
        status: "planning",
        members: {
          create: {
            userId,
            role: "owner",
            displayName: displayName || user.name,
            emoji: emoji || user.emoji,
            color: color || user.color,
          },
        },
        days: {
          create: template.days.map((d) => ({
            dayNumber: d.dayNumber,
            date: new Date(startDate.getTime() + (d.dayNumber - 1) * 24 * 60 * 60 * 1000),
            city: d.city,
            cityKey: d.cityKey,
            title: d.title,
            summary: d.summary,
            accentColor: d.accentColor,
          })),
        },
      },
      include: { days: true, members: true },
    });
    });

    // Create places for each day
    for (const templateDay of template.days) {
      const dbDay = trip.days.find((d) => d.dayNumber === templateDay.dayNumber);
      if (!dbDay) continue;
      for (const place of templateDay.places) {
        await db.place.create({
          data: {
            tripId: trip.id,
            dayId: dbDay.id,
            name: place.name,
            description: place.description,
            category: place.category,
            lat: place.lat,
            lng: place.lng,
            timeOfDay: place.timeOfDay,
            budget: place.budget,
            address: place.address,
            status: "planned",
            order: 0,
          },
        });
      }
    }

    // Create foods
    for (const food of template.foods) {
      await db.foodItem.create({
        data: {
          tripId: trip.id,
          name: food.name,
          nameCn: food.nameCn,
          description: food.description,
          city: food.city,
          price: food.price,
          emoji: food.emoji,
          order: 0,
        },
      });
    }

    // Create phrases
    for (const phrase of template.phrases) {
      await db.phrase.create({
        data: {
          tripId: trip.id,
          category: phrase.category,
          ru: phrase.ru,
          cn: phrase.cn,
          pinyin: phrase.pinyin,
          order: 0,
        },
      });
    }

    return NextResponse.json({
      id: trip.id,
      title: trip.title,
      coverEmoji: trip.coverEmoji,
      coverColor: trip.coverColor,
      message: `Поездка "${trip.title}" создана из шаблона!`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LIMIT_REACHED") {
      return NextResponse.json({
        error: "Лимит поездок исчерпан. Перейдите на Premium.",
        upgrade: true,
      }, { status: 403 });
    }
    console.error("Create from template error:", e);
    return NextResponse.json({ error: "Failed to create trip from template" }, { status: 500 });
  }
}
