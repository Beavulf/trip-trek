import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/import — импорт данных из JSON (полная замена)
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data || data.app !== "TripTrek China") {
      return NextResponse.json({ error: "Неверный формат файла" }, { status: 400 });
    }

    // Очистка всех таблиц
    await Promise.all([
      db.photo.deleteMany(),
      db.expense.deleteMany(),
      db.journalEntry.deleteMany(),
      db.place.deleteMany(),
      db.day.deleteMany(),
      db.participant.deleteMany(),
      db.checklistItem.deleteMany(),
      db.infoItem.deleteMany(),
      db.phrase.deleteMany(),
      db.foodItem.deleteMany(),
    ]);

    // Импорт участников
    if (data.participants) {
      for (const p of data.participants) {
        await db.participant.create({ data: { id: p.id, name: p.name, color: p.color, emoji: p.emoji, role: p.role, budget: p.budget } });
      }
    }

    // Импорт настроек
    if (data.settings) {
      await db.tripSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          title: data.settings.title,
          startDate: new Date(data.settings.startDate),
          endDate: data.settings.endDate ? new Date(data.settings.endDate) : null,
          totalDays: data.settings.totalDays,
          totalBudget: data.settings.totalBudget,
          currency: data.settings.currency,
          currentUserId: data.settings.currentUserId,
        },
        update: {
          title: data.settings.title,
          startDate: new Date(data.settings.startDate),
          endDate: data.settings.endDate ? new Date(data.settings.endDate) : null,
          totalDays: data.settings.totalDays,
          totalBudget: data.settings.totalBudget,
          currentUserId: data.settings.currentUserId,
        },
      });
    }

    // Импорт дней
    if (data.days) {
      for (const d of data.days) {
        await db.day.create({
          data: {
            id: d.id, dayNumber: d.dayNumber, date: new Date(d.date),
            city: d.city, cityKey: d.cityKey, title: d.title,
            summary: d.summary, accentColor: d.accentColor,
          },
        });
      }
    }

    // Импорт мест
    if (data.places) {
      for (const p of data.places) {
        await db.place.create({
          data: {
            id: p.id, name: p.name, description: p.description, category: p.category,
            lat: p.lat, lng: p.lng, dayId: p.dayId, timeOfDay: p.timeOfDay,
            status: p.status, budget: p.budget, address: p.address, notes: p.notes,
            rating: p.rating, visitedAt: p.visitedAt ? new Date(p.visitedAt) : null, order: p.order,
          },
        });
      }
    }

    // Импорт трат
    if (data.expenses) {
      for (const e of data.expenses) {
        await db.expense.create({
          data: {
            amount: e.amount, category: e.category, description: e.description,
            paidById: e.paidById, dayId: e.dayId,
          },
        });
      }
    }

    // Импорт записей дневника
    if (data.journals) {
      for (const j of data.journals) {
        await db.journalEntry.create({
          data: {
            dayId: j.dayId, participantId: j.participantId, mood: j.mood, content: j.content,
          },
        });
      }
    }

    // Импорт чек-листа
    if (data.checklist) {
      for (const c of data.checklist) {
        await db.checklistItem.create({
          data: { text: c.text, category: c.category, done: c.done, order: c.order },
        });
      }
    }

    // Импорт справки
    if (data.info) {
      for (const i of data.info) {
        await db.infoItem.create({
          data: { type: i.type, title: i.title, content: i.content, icon: i.icon, order: i.order },
        });
      }
    }

    // Импорт фраз
    if (data.phrases) {
      for (const p of data.phrases) {
        await db.phrase.create({
          data: { category: p.category, ru: p.ru, cn: p.cn, pinyin: p.pinyin, favorite: p.favorite, order: p.order },
        });
      }
    }

    // Импорт блюд
    if (data.foods) {
      for (const f of data.foods) {
        await db.foodItem.create({
          data: {
            name: f.name, nameCn: f.nameCn, description: f.description, city: f.city,
            place: f.place, price: f.price, emoji: f.emoji, tried: f.tried, rating: f.rating, order: f.order,
          },
        });
      }
    }

    return NextResponse.json({ success: true, message: "Данные импортированы" });
  } catch (e) {
    console.error("Import error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
