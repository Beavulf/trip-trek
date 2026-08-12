import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// POST /api/import?tripId=... — импорт данных поездки из JSON
// P0 #2: auth + membership; P1 #11: neutral destination (was hardcoded "China")
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // P0 #3: import into current trip (from query param or body)
    const tripId = new URL(req.url).searchParams.get("tripId") || body.trip?.id || body.tripId;
    if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
    // P0 #2: auth + membership — must be member of the trip you're importing into
    const { response } = await requireTripMember(req, tripId);
    if (response) return response;

    // P0 #3: validate marker — must be TripTrek export
    if (body.app && body.app !== "TripTrek") {
      return NextResponse.json({ error: "Это не файл TripTrek" }, { status: 400 });
    }

    // Upsert trip
    if (body.trip) {
      await db.trip.upsert({
        where: { id: tripId },
        create: {
          id: tripId,
          title: body.trip.title || "Imported Trip",
          destination: body.trip.destination || "Unknown",
          startDate: new Date(body.trip.startDate || Date.now()),
          endDate: body.trip.endDate ? new Date(body.trip.endDate) : null,
          totalDays: body.trip.totalDays || 12,
          totalBudget: body.trip.totalBudget || 1100,
        },
        update: {
          title: body.trip.title,
          destination: body.trip.destination,
          totalDays: body.trip.totalDays,
          totalBudget: body.trip.totalBudget,
        },
      });
    }

    // Import days
    if (body.days) {
      for (const d of body.days) {
        await db.day.upsert({
          where: { id: d.id },
          create: {
            id: d.id,
            tripId,
            dayNumber: d.dayNumber,
            date: new Date(d.date),
            city: d.city,
            cityKey: d.cityKey,
            title: d.title,
            summary: d.summary || null,
            accentColor: d.accentColor || null,
          },
          update: {},
        });
      }
    }

    // Import places
    if (body.places) {
      for (const p of body.places) {
        if (!p.id) continue;
        await db.place.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tripId,
            name: p.name,
            description: p.description || null,
            category: p.category || "other",
            lat: p.lat || 0,
            lng: p.lng || 0,
            dayId: p.dayId,
            timeOfDay: p.timeOfDay || null,
            status: p.status || "planned",
            budget: p.budget || null,
            address: p.address || null,
            notes: p.notes || null,
            order: p.order || 0,
          },
          update: {},
        });
      }
    }

    // Import expenses
    if (body.expenses) {
      for (const e of body.expenses) {
        if (!e.id) continue;
        await db.expense.upsert({
          where: { id: e.id },
          create: {
            id: e.id,
            tripId,
            amount: e.amount,
            category: e.category || "other",
            description: e.description || "",
            paidById: e.paidById || "",
            dayId: e.dayId || null,
          },
          update: {},
        });
      }
    }

    // Import checklist
    if (body.checklist) {
      for (const c of body.checklist) {
        if (!c.id) continue;
        await db.checklistItem.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            tripId,
            text: c.text,
            category: c.category || "preparation",
            done: c.done || false,
            order: c.order || 0,
          },
          update: {},
        });
      }
    }

    // Import info items
    if (body.info) {
      for (const i of body.info) {
        if (!i.id) continue;
        await db.infoItem.upsert({
          where: { id: i.id },
          create: {
            id: i.id,
            tripId,
            type: i.type,
            title: i.title,
            content: i.content,
            icon: i.icon || null,
            order: i.order || 0,
          },
          update: {},
        });
      }
    }

    // Import phrases
    if (body.phrases) {
      for (const p of body.phrases) {
        if (!p.id) continue;
        await db.phrase.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tripId,
            category: p.category,
            ru: p.ru,
            cn: p.cn,
            pinyin: p.pinyin,
            favorite: p.favorite || false,
            order: p.order || 0,
          },
          update: {},
        });
      }
    }

    // Import foods
    if (body.foods) {
      for (const f of body.foods) {
        if (!f.id) continue;
        await db.foodItem.upsert({
          where: { id: f.id },
          create: {
            id: f.id,
            tripId,
            name: f.name,
            nameCn: f.nameCn || null,
            description: f.description || "",
            city: f.city || "",
            place: f.place || null,
            price: f.price || null,
            emoji: f.emoji || null,
            imageUrl: f.imageUrl || null,
            tried: f.tried || false,
            rating: f.rating || null,
            order: f.order || 0,
          },
          update: {},
        });
      }
    }

    // Import budget plans
    if (body.budgetPlans) {
      for (const bp of body.budgetPlans) {
        if (!bp.id) continue;
        await db.budgetPlan.upsert({
          where: { id: bp.id },
          create: {
            id: bp.id,
            tripId,
            category: bp.category,
            amount: bp.amount,
          },
          update: {},
        });
      }
    }

    return NextResponse.json({ success: true, tripId });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
