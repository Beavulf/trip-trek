import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// GET /api/foods?city=guangzhou
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const where = city && city !== "all" ? { city } : undefined;
  const foods = await db.foodItem.findMany({
    where,
    orderBy: [{ city: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(foods);
}

// PATCH — отметить пробовал/рейтинг/imageUrl
export async function PATCH(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  // multipart form upload фото
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const id = formData.get("id") as string;
    if (!file || !id) {
      return NextResponse.json({ error: "file and id required" }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `food-${randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
    const url = `/uploads/${fileName}`;
    const food = await db.foodItem.update({ where: { id }, data: { imageUrl: url } });
    return NextResponse.json(food);
  }

  // JSON — обычное обновление
  const body = await req.json();
  const { id, tried, rating, imageUrl } = body;
  const data: Record<string, unknown> = {};
  if (typeof tried === "boolean") data.tried = tried;
  if (typeof rating === "number" || rating === null) data.rating = rating;
  if (typeof imageUrl === "string" || imageUrl === null) data.imageUrl = imageUrl;
  const food = await db.foodItem.update({ where: { id }, data });
  return NextResponse.json(food);
}
