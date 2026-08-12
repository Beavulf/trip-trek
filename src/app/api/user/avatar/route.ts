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

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
    if (file.type && !allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `avatar-${userId}-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

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
