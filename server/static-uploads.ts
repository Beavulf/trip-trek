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
  ".svg": "image/svg+xml",
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

  createReadStream(filePath).pipe(res);
  return true;
}
