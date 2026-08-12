import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripOwner } from "@/lib/api-auth";

function newId() {
  return crypto.randomUUID();
}

// POST /api/import?tripId=... — импорт данных в текущую поездку
// Всегда создаём НОВЫЕ id (не upsert по id из файла) — иначе можно привязать к чужой поездке
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tripId = new URL(req.url).searchParams.get("tripId") || body.tripId;
    if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

    const { response } = await requireTripOwner(req, tripId);
    if (response) return response;

    if (body.app && body.app !== "TripTrek") {
      return NextResponse.json({ error: "Это не файл TripTrek" }, { status: 400 });
    }

    const members = await db.tripMember.findMany({
      where: { tripId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));

    const dayIdMap = new Map<string, string>();
    let imported = {
      days: 0,
      places: 0,
      expenses: 0,
      checklist: 0,
      info: 0,
      phrases: 0,
      foods: 0,
      budgetPlans: 0,
      skippedExpenses: 0,
    };

    await db.$transaction(async (tx) => {
      if (body.trip) {
        await tx.trip.update({
          where: { id: tripId },
          data: {
            title: body.trip.title || undefined,
            destination: body.trip.destination || undefined,
            totalDays: body.trip.totalDays || undefined,
            totalBudget: body.trip.totalBudget ?? undefined,
            startDate: body.trip.startDate ? new Date(body.trip.startDate) : undefined,
            endDate: body.trip.endDate ? new Date(body.trip.endDate) : undefined,
          },
        });
      }

      if (Array.isArray(body.days)) {
        for (const d of body.days) {
          const id = newId();
          if (d.id) dayIdMap.set(d.id, id);
          await tx.day.create({
            data: {
              id,
              tripId,
              dayNumber: d.dayNumber,
              date: new Date(d.date || Date.now()),
              city: d.city || "Город",
              cityKey: d.cityKey || "custom",
              title: d.title || `День ${d.dayNumber}`,
              summary: d.summary || null,
              accentColor: d.accentColor || null,
            },
          });
          imported.days++;
        }
      }

      if (Array.isArray(body.places)) {
        for (const p of body.places) {
          const mappedDayId = p.dayId ? dayIdMap.get(p.dayId) : undefined;
          if (!mappedDayId) continue;
          await tx.place.create({
            data: {
              id: newId(),
              tripId,
              name: p.name || "Место",
              description: p.description || null,
              category: p.category || "other",
              lat: typeof p.lat === "number" ? p.lat : 0,
              lng: typeof p.lng === "number" ? p.lng : 0,
              dayId: mappedDayId,
              timeOfDay: p.timeOfDay || null,
              status: p.status || "planned",
              budget: p.budget ?? null,
              address: p.address || null,
              notes: p.notes || null,
              order: p.order || 0,
            },
          });
          imported.places++;
        }
      }

      if (Array.isArray(body.expenses)) {
        for (const e of body.expenses) {
          const paidById = e.paidById;
          if (!paidById || !memberIds.has(paidById)) {
            imported.skippedExpenses++;
            continue;
          }
          const mappedDayId = e.dayId ? dayIdMap.get(e.dayId) ?? null : null;
          await tx.expense.create({
            data: {
              id: newId(),
              tripId,
              amount: Number(e.amount) || 0,
              category: e.category || "other",
              description: e.description || "",
              paidById,
              dayId: mappedDayId,
              splitWith: typeof e.splitWith === "string" ? e.splitWith : "",
              excludeSelf: !!e.excludeSelf,
            },
          });
          imported.expenses++;
        }
      }

      if (Array.isArray(body.checklist)) {
        for (const c of body.checklist) {
          await tx.checklistItem.create({
            data: {
              id: newId(),
              tripId,
              text: c.text || "",
              category: c.category || "preparation",
              done: !!c.done,
              order: c.order || 0,
            },
          });
          imported.checklist++;
        }
      }

      if (Array.isArray(body.info)) {
        for (const i of body.info) {
          await tx.infoItem.create({
            data: {
              id: newId(),
              tripId,
              type: i.type || "note",
              title: i.title || "",
              content: i.content || "",
              icon: i.icon || null,
              order: i.order || 0,
            },
          });
          imported.info++;
        }
      }

      if (Array.isArray(body.phrases)) {
        for (const p of body.phrases) {
          await tx.phrase.create({
            data: {
              id: newId(),
              tripId,
              category: p.category || "general",
              ru: p.ru || "",
              cn: p.cn || "",
              pinyin: p.pinyin || "",
              favorite: !!p.favorite,
              order: p.order || 0,
            },
          });
          imported.phrases++;
        }
      }

      if (Array.isArray(body.foods)) {
        for (const f of body.foods) {
          await tx.foodItem.create({
            data: {
              id: newId(),
              tripId,
              name: f.name || "",
              nameCn: f.nameCn || null,
              description: f.description || "",
              city: f.city || "",
              place: f.place || null,
              price: f.price ?? null,
              emoji: f.emoji || null,
              imageUrl: f.imageUrl || null,
              tried: !!f.tried,
              rating: f.rating ?? null,
              order: f.order || 0,
            },
          });
          imported.foods++;
        }
      }

      if (Array.isArray(body.budgetPlans)) {
        for (const bp of body.budgetPlans) {
          await tx.budgetPlan.create({
            data: {
              id: newId(),
              tripId,
              category: bp.category || "other",
              amount: Number(bp.amount) || 0,
            },
          });
          imported.budgetPlans++;
        }
      }
    });

    return NextResponse.json({
      success: true,
      tripId,
      imported,
      note: "Фото, дневник и чат из бэкапа не импортируются",
    });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
