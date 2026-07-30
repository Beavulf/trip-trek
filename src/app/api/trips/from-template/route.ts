import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TRIP_TEMPLATES } from "@/lib/trip-templates";

// POST /api/trips/from-template — создать поездку из шаблона
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, userId, displayName, emoji, color, customTitle } = body;

    if (!templateId || !userId) {
      return NextResponse.json({ error: "templateId, userId required" }, { status: 400 });
    }

    const template = TRIP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "template not found" }, { status: 404 });
    }

    // Check limits
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const isPremium = user.plan === "premium" && (!user.planExpiry || user.planExpiry > new Date());
    const maxTrips = isPremium ? Infinity : 1;
    const tripCount = await db.tripMember.count({ where: { userId, role: "owner" } });
    if (tripCount >= maxTrips) {
      return NextResponse.json({
        error: "Лимит поездок исчерпан. Перейдите на Premium.",
        upgrade: true,
      }, { status: 403 });
    }

    // Create trip with all template data
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + template.totalDays * 24 * 60 * 60 * 1000);

    const trip = await db.trip.create({
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
    console.error("Create from template error:", e);
    return NextResponse.json({ error: "Failed to create trip from template" }, { status: 500 });
  }
}
