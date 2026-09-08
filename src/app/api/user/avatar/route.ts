import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireUser } from "@/lib/api-auth";

// POST /api/user/avatar — загрузить фото профиля (только себе)
export async function POST(req: NextRequest) {
  try {
    const { user: authUser, response } = await requireUser(req);
    if (response) return response;
    const userId = authUser!.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    // P1: тип обязателен и должен быть изображением; раньше пустой type пропускал любой файл
    if (!file.type || !allowedTypes.has(file.type.toLowerCase())) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // P1: сниффинг магических байтов — файл сохраняется на диск как есть,
    // поэтому доверять имени/заголовку нельзя (HTML/SVG с XSS не должны проходить)
    const buf = Buffer.from(await file.arrayBuffer());
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    const isWebp = buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // расширение — из фактического типа, не из имени файла
    const ext = file.type.toLowerCase() === "image/jpeg" ? "jpg" : file.type.toLowerCase().slice("image/".length);
    const fileName = `avatar-${userId}-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), buf);

    const url = `/uploads/avatars/${fileName}`;

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
