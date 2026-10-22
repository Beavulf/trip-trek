import { describe, expect, it } from "vitest";
import {
  centralRecord,
  crc32,
  dosDateTime,
  eocdRecord,
  localHeader,
  zip64EocdLocator,
  zip64EocdRecord,
  zipEntryName,
  zipStream,
  type ZipEntry,
} from "./zip";

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

// zip64: снятие потолков классического ZIP (4 ГБ / 65535 записей). Заголовочные
// билдеры проверяем напрямую — 4 ГБ данных в юнит-тесте не получить; интеграционно
// zip64-каталог exercising архивом из 66 000 крошечных записей.
describe("zip64", () => {
  const GB5 = 5 * 1024 * 1024 * 1024; // заведомо больше u32

  /** Смещение EOCD с конца архива (комментария у нас нет) */
  function findEocd(bytes: Uint8Array): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  it("обычная запись остаётся классической (без extra, версия 2.0)", () => {
    const name = new TextEncoder().encode("a.jpg");
    const local = localHeader(name, 10, 7, new Date(2026, 9, 21));
    expect(local.length).toBe(30 + name.length);
    const lv = new DataView(local.buffer);
    expect(lv.getUint16(4, true)).toBe(20);
    expect(lv.getUint16(28, true)).toBe(0);
    expect(lv.getUint32(18, true)).toBe(10);

    const central = centralRecord(name, 10, 7, new Date(2026, 9, 21), 40);
    const cv = new DataView(central.buffer);
    expect(cv.getUint16(6, true)).toBe(20);
    expect(cv.getUint16(30, true)).toBe(0);
    expect(cv.getUint32(42, true)).toBe(40);
  });

  it("гигантский размер записи уводит local и central в zip64", () => {
    const name = new TextEncoder().encode("a.jpg");

    const local = localHeader(name, GB5, 123, new Date(2026, 9, 21));
    const lv = new DataView(local.buffer);
    expect(lv.getUint16(4, true)).toBe(45); // version needed 4.5
    expect(lv.getUint32(18, true)).toBe(0xffffffff); // escape
    expect(lv.getUint32(22, true)).toBe(0xffffffff);
    expect(lv.getUint16(28, true)).toBe(20); // extra: заголовок + два u64
    const e = 30 + name.length;
    expect(lv.getUint16(e, true)).toBe(0x0001);
    expect(lv.getUint16(e + 2, true)).toBe(16);
    expect(lv.getBigUint64(e + 4, true)).toBe(BigInt(GB5));
    expect(lv.getBigUint64(e + 12, true)).toBe(BigInt(GB5));

    const central = centralRecord(name, GB5, 123, new Date(2026, 9, 21), 100);
    const cv = new DataView(central.buffer);
    expect(cv.getUint16(6, true)).toBe(45);
    expect(cv.getUint32(20, true)).toBe(0xffffffff);
    expect(cv.getUint32(24, true)).toBe(0xffffffff);
    expect(cv.getUint16(30, true)).toBe(28);
    const ce = 46 + name.length;
    expect(cv.getUint16(ce, true)).toBe(0x0001);
    expect(cv.getUint16(ce + 2, true)).toBe(24);
    expect(cv.getBigUint64(ce + 4, true)).toBe(BigInt(GB5));
    expect(cv.getBigUint64(ce + 12, true)).toBe(BigInt(GB5));
    expect(cv.getBigUint64(ce + 20, true)).toBe(BigInt(100));
  });

  it("гигантское смещение уводит central в zip64, размеры остаются u32", () => {
    const name = new TextEncoder().encode("a.jpg");
    const central = centralRecord(name, 10, 7, new Date(2026, 9, 21), GB5);
    const cv = new DataView(central.buffer);
    expect(cv.getUint32(20, true)).toBe(10);
    expect(cv.getUint32(42, true)).toBe(0xffffffff);
    expect(cv.getUint16(30, true)).toBe(28);
    const ce = 46 + name.length;
    expect(cv.getBigUint64(ce + 20, true)).toBe(BigInt(GB5));
  });

  it("EOCD ставит escape-значения, когда поля не влезают", () => {
    const eocd = eocdRecord(70000, GB5, GB5 + 100);
    const v = new DataView(eocd.buffer);
    expect(v.getUint16(8, true)).toBe(0xffff);
    expect(v.getUint16(10, true)).toBe(0xffff);
    expect(v.getUint32(12, true)).toBe(0xffffffff);
    expect(v.getUint32(16, true)).toBe(0xffffffff);
  });

  it("zip64 EOCD и локатор кодируют настоящие значения", () => {
    const rec = zip64EocdRecord(70000, GB5, GB5 + 100);
    expect(rec.length).toBe(56);
    const rv = new DataView(rec.buffer);
    expect(rv.getUint32(0, true)).toBe(0x06064b50);
    expect(rv.getBigUint64(4, true)).toBe(BigInt(44)); // размер записи без сигнатуры и самого поля
    expect(rv.getBigUint64(24, true)).toBe(BigInt(70000));
    expect(rv.getBigUint64(32, true)).toBe(BigInt(70000));
    expect(rv.getBigUint64(40, true)).toBe(BigInt(GB5));
    expect(rv.getBigUint64(48, true)).toBe(BigInt(GB5 + 100));

    const loc = zip64EocdLocator(GB5 + 200);
    expect(loc.length).toBe(20);
    const lv = new DataView(loc.buffer);
    expect(lv.getUint32(0, true)).toBe(0x07064b50);
    expect(lv.getBigUint64(8, true)).toBe(BigInt(GB5 + 200));
    expect(lv.getUint32(16, true)).toBe(1);
  });

  it("архив из 66 000 записей получает zip64-каталог", async () => {
    const entries: ZipEntry[] = Array.from({ length: 66_000 }, (_, i) => ({
      name: `f${String(i).padStart(5, "0")}.txt`,
      data: new TextEncoder().encode(`data-${i}`),
    }));
    const zip = await collect(zipStream(entries));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    // классический EOCD — последний, с escape-значениями
    const eocd = findEocd(zip);
    expect(eocd).toBeGreaterThan(0);
    expect(view.getUint16(eocd + 8, true)).toBe(0xffff);
    expect(view.getUint16(eocd + 10, true)).toBe(0xffff);

    // перед EOCD локатор, перед ним zip64 EOCD с настоящим числом записей
    expect(view.getUint32(eocd - 20, true)).toBe(0x07064b50);
    const zip64Eocd = eocd - 20 - 56;
    expect(view.getUint32(zip64Eocd, true)).toBe(0x06064b50);
    expect(view.getBigUint64(zip64Eocd + 24, true)).toBe(BigInt(66000));
    expect(view.getBigUint64(zip64Eocd + 32, true)).toBe(BigInt(66000));
    expect(view.getBigUint64(eocd - 20 + 8, true)).toBe(BigInt(zip64Eocd));
  });
});
