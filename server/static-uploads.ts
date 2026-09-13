// Serve runtime uploads from disk.
// Next.js production only ships build-time public/ files — Docker volume uploads
// would 404 without this (gallery shows «Не удалось показать фото»).

import type { IncomingMessage, ServerResponse } from "http";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const UPLOADS_ROOT = path.resolve(process.cwd(), "public", "uploads");

/** Returns true if the request was handled (including 404 for missing file). */
export function handleUploadsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const rawUrl = req.url || "";
  if (!rawUrl.startsWith("/uploads/") || (req.method !== "GET" && req.method !== "HEAD")) {
    return false;
  }

  // FS-ошибки (гонка stat/open с одновременным удалением файла и т.п.) не должны
  // вылетать uncaughtException'ом: server.ts завершает процесс, а он один на все
  // поездки (аудит 2026-09-12). Для клиента расхождение выглядит как 404.
  try {
    return serveUpload(req, res, rawUrl);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.setHeader("Cache-Control", "no-store");
    }
    res.end();
    return true;
  }
}

function serveUpload(req: IncomingMessage, res: ServerResponse, rawUrl: string): boolean {
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0] || "");
  } catch {
    res.statusCode = 400;
    res.end("Bad path");
    return true;
  }

  // /uploads/... → relative under public/uploads
  const rel = pathname.replace(/^\/uploads\/?/, "");
  if (!rel || rel.includes("\0") || rel.split("/").some((p) => p === "..")) {
    res.statusCode = 400;
    res.end("Bad path");
    return true;
  }

  const filePath = path.resolve(UPLOADS_ROOT, rel);
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep) && filePath !== UPLOADS_ROOT) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Cache-Control", "no-store");
    res.end("Not found");
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const { size } = statSync(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", String(size));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  // Ошибка чтения после отправки заголовков (файл удалили между stat и open) —
  // обрываем соединение; без обработчика stream-'error' процесс бы упал
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    res.destroy();
  });
  stream.pipe(res);
  return true;
}
