import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";
import { put as storagePut, remove as storageRemove, StorageError } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";

// GET /api/foods?tripId=...&city=...
// P0 #2: tripId required — без него 400 (раньше пустая строка → where={} → все блюда всех поездок)
// P0 #3: auth + membership
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const city = searchParams.get("city");
  const where: Record<string, unknown> = { tripId };
  if (city && city !== "all") where.city = city;

  const foods = await db.foodItem.findMany({
    where,
    orderBy: [{ city: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(foods);
}

// POST /api/foods — добавить блюдо
// P0 #3: auth + membership (было)
// P1 #5: await emitWS
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, name, nameCn, description, city, place, price, emoji } = body;

  // Валидация до обращения к БД: иначе невалидный tripId роняет findUnique в 500
  if (!tripId || !name || !city) {
    return NextResponse.json({ error: "tripId, name, city required" }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim().length > 200) {
    return NextResponse.json({ error: "name too long (max 200)" }, { status: 400 });
  }

  const { user: foodUser, response } = await requireTripMember(req, tripId);
  if (response) return response;

  // 20 блюд в час на пользователя
  const limited = userRateLimit(req, foodUser!.id, "foods", 20, 60 * 60_000);
  if (limited) return limited;

  // Максимальный order
  const maxOrder = await db.foodItem.findFirst({
    where: { tripId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const food = await db.foodItem.create({
    data: {
      tripId,
      name: name.trim(),
      nameCn: nameCn || null,
      description: description || "",
      city: city.trim(),
      place: place || null,
      price: price || null,
      emoji: emoji || "🍽️",
      order: (maxOrder?.order ?? 0) + 1,
    },
  });

  await publish(tripId, "food:updated", {});
  return NextResponse.json(food);
}

// DELETE /api/foods?id=...
// P0 #3: membership check via food.tripId (было)
// P1 #5: await emitWS
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const food = await db.foodItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!food) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { response } = await requireTripMember(req, food.tripId);
  if (response) return response;

  await db.foodItem.delete({ where: { id } });
  await publish(food.tripId, "food:updated", {});
  return NextResponse.json({ ok: true });
}

// PATCH — multipart (photo upload) or JSON
// P0 #3: membership check via food.tripId (раньше PATCH не проверял membership!)
// P1 #8: upload limits — size/MIME; 404 if food not found
// P1 #5: await emitWS
export async function PATCH(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const id = formData.get("id") as string;
    if (!file || !id) return NextResponse.json({ error: "file and id required" }, { status: 400 });

    // P0 #3: membership check via food.tripId
    const existing = await db.foodItem.findUnique({ where: { id }, select: { tripId: true, imageUrl: true } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { response } = await requireTripMember(req, existing.tripId);
    if (response) return response;

    // Единая политика хранилища: magic bytes (не доверяем MIME/расширению),
    // лимит 10MB, sharp-обработка — stored-XSS через /uploads исключён
    let url: string;
    try {
      const res = await storagePut({ data: Buffer.from(await file.arrayBuffer()), kind: "food" });
      url = res.url;
    } catch (e) {
      if (e instanceof StorageError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error("[foods] image upload failed:", e);
      return NextResponse.json({ error: "Не удалось загрузить изображение" }, { status: 500 });
    }
    const food = await db.foodItem.update({ where: { id }, data: { imageUrl: url } });
    await publish(food.tripId, "food:updated", {});

    // Старое изображение блюда больше не нужно
    if (existing.imageUrl && existing.imageUrl !== url) {
      try {
        await storageRemove(existing.imageUrl);
      } catch {
        // не критично
      }
    }
    return NextResponse.json(food);
  }

  // JSON PATCH — частичное обновление: отметки, рейтинг, фото, редактирование полей, голос «хочу»
  const body = await req.json();
  const { id, tried, rating, imageUrl, want } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // P0 #3: membership check via food.tripId (раньше PATCH не проверял!)
  const existing = await db.foodItem.findUnique({ where: { id }, select: { tripId: true, wantedBy: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (typeof tried === "boolean") data.tried = tried;
  if (typeof rating === "number" || rating === null) data.rating = rating;
  if (typeof imageUrl === "string" || imageUrl === null) data.imageUrl = imageUrl;
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 200) return NextResponse.json({ error: "name: 1–200 символов" }, { status: 400 });
    data.name = name;
  }
  if (typeof body.nameCn === "string" || body.nameCn === null) data.nameCn = body.nameCn ? body.nameCn.trim().slice(0, 100) || null : null;
  if (typeof body.description === "string" || body.description === null) data.description = (body.description ?? "").slice(0, 2000);
  if (typeof body.city === "string") {
    const city = body.city.trim();
    if (!city || city.length > 100) return NextResponse.json({ error: "city: 1–100 символов" }, { status: 400 });
    data.city = city;
  }
  if (typeof body.place === "string" || body.place === null) data.place = body.place ? body.place.trim().slice(0, 200) || null : null;
  if (typeof body.price === "string" || body.price === null) data.price = body.price ? body.price.trim().slice(0, 50) || null : null;
  if (typeof body.emoji === "string" || body.emoji === null) data.emoji = body.emoji ? body.emoji.slice(0, 8) : null;
  // Голос «хочу попробовать»: сервер сам добавляет/убирает голос АВТОРИЗОВАННОГО пользователя.
  // Клиентский полный список принял бы любые userId (подделка чужих голосов) и терял голоса при гонке.
  if (typeof want === "boolean") {
    let ids: string[] = [];
    try {
      const arr = JSON.parse(existing.wantedBy ?? "[]");
      if (Array.isArray(arr)) ids = arr.filter((v): v is string => typeof v === "string");
    } catch {
      /* битый JSON — начинаем с пустого списка */
    }
    ids = want ? [...new Set([...ids, user.id])] : ids.filter((v) => v !== user.id);
    data.wantedBy = JSON.stringify(ids.slice(0, 20));
  }
  if (typeof rating === "number" && (rating < 1 || rating > 5)) {
    return NextResponse.json({ error: "rating: 1–5" }, { status: 400 });
  }
  const food = await db.foodItem.update({ where: { id }, data });
  await publish(food.tripId, "food:updated", {});
  return NextResponse.json(food);
}
