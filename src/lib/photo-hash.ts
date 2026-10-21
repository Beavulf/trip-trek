// Отпечаток содержимого файла для дедупа фото. Имя файла — ненадёжный ключ
// (IMG_0001.jpg у всех одинаковый, мессенджеры переименовывают), поэтому
// считаем sha256 исходных байт: тот же кадр → тот же отпечаток, где бы он
// ни лежал. Считаем на клиенте ДО сжатия (сжатая копия нестабильна между
// устройствами); сервер хранит отпечаток и отклоняет повтор в поездке.

/** sha256 hex строки байт файла; crypto.subtle есть во всех современных браузерах. */
export async function computeFileHash(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // отпечаток не критичен: без него фото просто уйдёт без дедуп-проверки
    return null;
  }
}
