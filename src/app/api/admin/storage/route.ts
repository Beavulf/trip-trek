import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { userRateLimit } from "@/lib/rate-limit";
import { remove as storageRemove } from "@/lib/storage";
import { getStorageUsage, findOrphans } from "@/lib/storage/stats";

// GET /api/admin/storage            — занятое место по типам файлов
// GET /api/admin/storage?scan=1     — + список «сирот» (dry-run, ничего не удаляет)
// POST /api/admin/storage { urls }  — удалить перечисленные файлы (только из /uploads/,
//                                     перед удалением перепроверяем, что ссылок в БД нет)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const scan = new URL(req.url).searchParams.get("scan") === "1";
  const usage = await getStorageUsage();
  if (!scan) return NextResponse.json(usage);

  const orphans = await findOrphans();
  return NextResponse.json({ ...usage, orphans });
}

export async function POST(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-storage", 10, 60_000);
  if (limited) return limited;

  const { urls } = (await req.json().catch(() => ({}))) as { urls?: string[] };
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 1000) {
    return NextResponse.json({ error: "urls: массив до 1000 ссылок" }, { status: 400 });
  }

  // Скан повторно: чистим только то, что и сейчас числится сиротой
  const orphans = new Set((await findOrphans()).map((o) => o.url));
  const toDelete = urls.filter((u) => typeof u === "string" && orphans.has(u));

  let deleted = 0;
  for (const url of toDelete) {
    try {
      await storageRemove(url);
      deleted += 1;
    } catch {
      // файл мог исчезнуть — не страшно
    }
  }

  if (deleted > 0) {
    await logAdmin(admin!.id, "storage.purge", { type: "storage", label: "Хранилище" }, { deleted });
  }

  const usage = await getStorageUsage();
  return NextResponse.json({ ok: true, deleted, skipped: urls.length - deleted, ...usage });
}
