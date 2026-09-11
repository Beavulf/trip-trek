import path from "path";

/** Корень загруженных файлов (локальный диск, ADR-0003-amended). */
export const UPLOADS_ROOT = () =>
  process.env.UPLOADS_DIR || path.join(process.cwd(), "public", "uploads");
