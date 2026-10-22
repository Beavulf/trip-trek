import { compressImageForUpload, makeThumbnailBlob } from "@/lib/image-compress";
import { readPhotoExif } from "@/lib/photo-exif";
import { computeFileHash } from "@/lib/photo-hash";
import type { Prepared } from "./types";

/** Отдать поток интерфейсу между кадрами: на батче в сотню фото иначе подвисают тапы и скролл. */
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Подготовка одного кадра к отправке: сжатие, превью, EXIF (GPS + дата съёмки), sha256.
 * Сжатие — первым и отдельно: оно держит декодированный кадр в памяти, и EXIF/хэш
 * (читают сами байты файла) не должны накладываться на него — на 48-Мп снимках
 * пик памяти иначе убивает вкладку на телефоне.
 */
export async function prepareForUpload(file: File): Promise<Prepared> {
  const compressed = await compressImageForUpload(file);
  const [exif, hash] = await Promise.all([readPhotoExif(file), computeFileHash(file)]);
  const thumb = await makeThumbnailBlob(compressed);
  await yieldToMain();
  return {
    file: compressed,
    thumb,
    coords: exif?.coords ?? null,
    takenAt: exif?.takenAt ? exif.takenAt.getTime() : null,
    hash,
  };
}
