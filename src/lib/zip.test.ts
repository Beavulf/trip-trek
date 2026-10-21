import { describe, expect, it } from "vitest";
import { crc32, dosDateTime, zipEntryName, zipStream, type ZipEntry } from "./zip";

// Классический вектор CRC-32 (IEEE): ASCII «123456789» → 0xCBF43926
describe("crc32", () => {
  it("сходится с эталонным вектором", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("пустой вход — 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("dosDateTime", () => {
  it("кодирует дату и время", () => {
    const { time, date } = dosDateTime(new Date(2026, 9, 21, 14, 42, 4));
    expect(date).toBe(((2026 - 1980) << 9) | (10 << 5) | 21);
    expect(time).toBe((14 << 11) | (42 << 5) | 2);
  });
});

describe("zipEntryName", () => {
  it("чистит мусор и добавляет порядковый префикс", () => {
    expect(zipEntryName(7, "Академия клана Чэнь!", "jpg")).toBe("007-Академия-клана-Чэнь.jpg");
  });

  it("пустая база — не пустое имя", () => {
    expect(zipEntryName(1, "///", ".png")).toBe("001-photo.png");
  });
});

/** Мини-читатель ZIP: разбирает то, что написал zipStream, и возвращает записи. */
function parseZip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD ищем с конца: комментарий у нас пустой, но парсер не должен этого требовать
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThan(0);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    expect(method).toBe(0); // STORE
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // Локальный заголовок: пропускаем имя+extra, читаем данные
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({ name, data: bytes.subarray(dataStart, dataStart + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

describe("zipStream", () => {
  it("roundtrip: имена (включая кириллицу) и содержимое на месте", async () => {
    const entries: ZipEntry[] = [
      { name: "001-Кантонская-башня.jpg", data: new TextEncoder().encode("jpeg-bytes-1"), mtime: new Date(2026, 9, 21) },
      { name: "002-Академия-клана-Чэнь.jpg", data: new TextEncoder().encode("jpeg-bytes-22"), mtime: new Date(2026, 9, 22) },
    ];
    const zip = await collect(zipStream(entries));
    const parsed = parseZip(zip);
    expect(parsed.map((e) => e.name)).toEqual(["001-Кантонская-башня.jpg", "002-Академия-клана-Чэнь.jpg"]);
    expect(new TextDecoder().decode(parsed[0].data)).toBe("jpeg-bytes-1");
    expect(new TextDecoder().decode(parsed[1].data)).toBe("jpeg-bytes-22");
  });

  it("пустой архив валиден (только EOCD)", async () => {
    const zip = await collect(zipStream([]));
    expect(zip.length).toBe(22);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(8, true)).toBe(0);
  });

  it("ошибка источника пробивает поток (controller.error)", async () => {
    const failing: AsyncIterable<ZipEntry> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new Error("disk gone")),
          return: () => Promise.resolve({ value: undefined, done: true }),
        };
      },
    };
    const reader = zipStream(failing).getReader();
    await expect(reader.read()).rejects.toThrow("disk gone");
  });
});
