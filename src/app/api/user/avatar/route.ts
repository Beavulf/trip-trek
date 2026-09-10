import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { put as storagePut, remove as storageRemove, StorageError } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";

// POST /api/user/avatar — загрузить фото профиля (только себе)
export async function POST(req: NextRequest) {
  try {
    const { user: authUser, response } = await requireUser(req);
    if (response) return response;
    const userId = authUser!.id;

    const limited = userRateLimit(req, userId, "avatar", 10, 60 * 60_000);
    if (limited) return limited;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    // Единая политика хранилища: magic bytes, лимит 5MB, sharp-обработка
    // (EXIF/GPS выпиливаются, 512×512 jpeg)
    let url: string;
    try {
      const res = await storagePut({ data: Buffer.from(await file.arrayBuffer()), kind: "avatar" });
      url = res.url;
    } catch (e) {
      if (e instanceof StorageError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const prev = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    await db.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    // Старый файл аватара больше не нужен
    if (prev?.avatarUrl) {
      try {
        await storageRemove(prev.avatarUrl);
      } catch {
        // не критично
      }
    }

    return NextResponse.json({ url, message: "Аватар обновлён" });
  } catch (e) {
    console.error("Avatar upload error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
