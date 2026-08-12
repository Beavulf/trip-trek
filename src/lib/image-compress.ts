/**
 * Mobile-safe image compression — avoids OOM from full-res camera frames.
 * Caps longest side, prefers createImageBitmap resize, always outputs JPEG.
 */

export class ImageCompressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressError";
  }
}

const HEIC_RE = /\.heic$|\.heif$/i;

export function isLikelyHeic(file: File): boolean {
  return (
    HEIC_RE.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

function scaleSize(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToJpegFile(
  source: CanvasImageSource,
  width: number,
  height: number,
  fileName: string,
  quality: number
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageCompressError("Canvas недоступен");
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  // Drop canvas refs ASAP for GC on mobile
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new ImageCompressError("Не удалось сжать фото");

  const base = fileName.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function compressViaBitmap(
  file: File,
  maxSide: number,
  quality: number
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = scaleSize(bitmap.width, bitmap.height, maxSide);
    // Prefer platform resize when available (lower peak memory)
    let resized: ImageBitmap = bitmap;
    try {
      resized = await createImageBitmap(bitmap, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "medium",
      });
      if (resized !== bitmap) bitmap.close();
    } catch {
      // fall through with original bitmap + canvas scale
    }
    try {
      const out = await canvasToJpegFile(
        resized,
        width,
        height,
        file.name,
        quality
      );
      return out;
    } finally {
      resized.close();
    }
  } catch (e) {
    bitmap.close();
    throw e;
  }
}

async function compressViaImageElement(
  file: File,
  maxSide: number,
  quality: number
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new ImageCompressError("Формат фото не поддерживается браузером"));
      el.src = url;
    });
    const { width, height } = scaleSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide);
    return await canvasToJpegFile(img, width, height, file.name, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Compress for upload. Never returns the original huge/HEIC file.
 * Falls back to original JPEG/PNG/WebP if under maxBytes when canvas fails (mobile).
 */
export async function compressImageForUpload(
  file: File,
  opts?: { maxSide?: number; quality?: number; maxBytes?: number }
): Promise<File> {
  const maxSide = opts?.maxSide ?? 1280;
  const quality = opts?.quality ?? 0.72;
  const maxBytes = opts?.maxBytes ?? 2.5 * 1024 * 1024;

  if (file.size > 30 * 1024 * 1024) {
    throw new ImageCompressError("Фото слишком большое (макс ~30MB)");
  }

  const type = (file.type || "").toLowerCase();
  const webFriendly =
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/png" ||
    type === "image/webp" ||
    /\.jpe?g$/i.test(file.name) ||
    /\.png$/i.test(file.name) ||
    /\.webp$/i.test(file.name);

  // Browser often cannot decode HEIC — fail early with clear message
  if (isLikelyHeic(file)) {
    try {
      await createImageBitmap(file);
    } catch {
      throw new ImageCompressError(
        "HEIC не поддерживается. В настройках камеры выберите JPEG/«Наиболее совместимый»"
      );
    }
  }

  const attempts: { maxSide: number; quality: number }[] = [
    { maxSide, quality },
    { maxSide: 960, quality: 0.65 },
    { maxSide: 720, quality: 0.6 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      let out: File;
      if (typeof createImageBitmap === "function") {
        try {
          out = await compressViaBitmap(file, attempt.maxSide, attempt.quality);
        } catch {
          out = await compressViaImageElement(file, attempt.maxSide, attempt.quality);
        }
      } else {
        out = await compressViaImageElement(file, attempt.maxSide, attempt.quality);
      }
      if (out.size <= maxBytes || attempt === attempts[attempts.length - 1]) {
        return out;
      }
    } catch (e) {
      lastError = e;
    }
  }

  // Last resort: already-small web image (camera sometimes gives JPEG that canvas rejects)
  if (webFriendly && file.size <= maxBytes) {
    const name = file.name?.includes(".") ? file.name : "photo.jpg";
    return new File([file], name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: type.startsWith("image/") ? type : "image/jpeg",
      lastModified: Date.now(),
    });
  }
  if (webFriendly && file.size <= 8 * 1024 * 1024) {
    // Still try original — server sharp will resize
    const name = file.name?.includes(".") ? file.name : "photo.jpg";
    return new File([file], name, {
      type: type || "image/jpeg",
      lastModified: Date.now(),
    });
  }

  if (lastError instanceof ImageCompressError) throw lastError;
  throw new ImageCompressError(
    isLikelyHeic(file)
      ? "HEIC не удалось обработать. Сохраните фото как JPEG"
      : "Не удалось обработать фото — попробуйте другое изображение"
  );
}
