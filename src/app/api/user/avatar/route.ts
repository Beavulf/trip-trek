import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireUser } from "@/lib/api-auth";

// POST /api/user/avatar — загрузить фото профиля
export async function POST(req: NextRequest) {
  try {
    const { response } = await requireUser(req);
    if (response) return response;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string;

    if (!file || !userId) {
      return NextResponse.json({ error: "file, userId required" }, { status: 400 });
    }

    // Валидация типа
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
    if (file.type && !allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    // Макс 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Сжимаем через Canvas на клиенте? Нет, тут просто сохраняем
    // В продакшене — использовать sharp для сжатия
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `avatar-${userId}-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

    const url = `/uploads/avatars/${fileName}`;

    // Обновляем пользователя
    await db.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return NextResponse.json({ url, message: "Аватар обновлён" });
  } catch (e) {
    console.error("Avatar upload error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
