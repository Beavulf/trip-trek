// Минимальный ZIP-писатель без зависимостей (метод STORE).
// JPEG/PNG уже сжаты — deflate только жёг бы CPU на слабом сервере.
// Архив собирается потоком: в памяти лежат заголовки центрального каталога
// (сотни байт на файл) и ОДИН текущий файл — сотни фото не раздувают heap.
// Формат — APPNOTE.TXT: local header → data → central directory → EOCD.
// Zip64 (поля >4 ГБ, каталог >65535 записей): размеры известны заранее
// (STORE, файл целиком в памяти), поэтому extra-поля пишем сразу, честно —
// без «маскирую 0xFFFFFFFF, размер узнаю в data descriptor» логики.

/** CRC-32 (IEEE 802.3, полином 0xEDB88320) — то, что ZIP ждёт в заголовках. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Дата/время в DOS-формате ZIP (локальное время, шаг 2 сек). */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** Имя внутри архива. Не-ASCII имена валидны: ставим флаг UTF-8 (бит 11). */
  name: string;
  data: Uint8Array;
  /** mtime записи; по умолчанию — сейчас */
  mtime?: Date;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}
function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}
function u64(view: DataView, offset: number, value: number) {
  view.setBigUint64(offset, BigInt(value), true);
}

// LOCAL_HEADER + имя; FIXED — общий размер всех заголовков без имени
const LOCAL_HEADER = 30;
const CENTRAL_FIXED = 46;
const EOCD = 22;
const ZIP64_EOCD = 56;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;
const ZIP64_EXTRA_ID = 0x0001;
const VERSION_ZIP64 = 45; // спецификация 4.5 — где появился zip64
/** 0xFFFFFFFF в поле — escape-метка «настоящее значение в zip64 extra», само оно не влезает */
const fitsU32 = (v: number) => v < U32_MAX;

// Билдеры экспортированы для тестов: zip64-пути по-другому не проверить —
// 4 ГБ данных в юнит-тесте не получить.
export function localHeader(nameBytes: Uint8Array, size: number, crc: number, mtime: Date): Uint8Array {
  const zip64 = !fitsU32(size);
  const extraLen = zip64 ? 20 : 0; // заголовок extra (4) + два u64 размеров
  const buf = new Uint8Array(LOCAL_HEADER + nameBytes.length + extraLen);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(mtime);
  u32(view, 0, 0x04034b50);
  u16(view, 4, zip64 ? VERSION_ZIP64 : 20); // version needed
  u16(view, 6, UTF8_FLAG);
  u16(view, 8, STORE_METHOD);
  u16(view, 10, time);
  u16(view, 12, date);
  u32(view, 14, crc);
  u32(view, 18, zip64 ? U32_MAX : size); // compressed
  u32(view, 22, zip64 ? U32_MAX : size); // uncompressed
  u16(view, 26, nameBytes.length);
  u16(view, 28, extraLen);
  buf.set(nameBytes, LOCAL_HEADER);
  if (zip64) {
    const e = LOCAL_HEADER + nameBytes.length;
    u16(view, e, ZIP64_EXTRA_ID);
    u16(view, e + 2, 16);
    u64(view, e + 4, size); // uncompressed
    u64(view, e + 12, size); // compressed
  }
  return buf;
}

export function centralRecord(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  mtime: Date,
  offset: number
): Uint8Array {
  // APPNOTE требует в central-zip64 extra сразу три поля (два размера + смещение),
  // даже если переполнено только одно
  const zip64 = !fitsU32(size) || !fitsU32(offset);
  const extraLen = zip64 ? 28 : 0;
  const buf = new Uint8Array(CENTRAL_FIXED + nameBytes.length + extraLen);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(mtime);
  u32(view, 0, 0x02014b50);
  u16(view, 4, zip64 ? VERSION_ZIP64 : 20); // version made by
  u16(view, 6, zip64 ? VERSION_ZIP64 : 20); // version needed
  u16(view, 8, UTF8_FLAG);
  u16(view, 10, STORE_METHOD);
  u16(view, 12, time);
  u16(view, 14, date);
  u32(view, 16, crc);
  u32(view, 20, fitsU32(size) ? size : U32_MAX);
  u32(view, 24, fitsU32(size) ? size : U32_MAX);
  u16(view, 28, nameBytes.length);
  u16(view, 30, extraLen); // extra
  u16(view, 32, 0); // comment
  u16(view, 34, 0); // disk number start
  u16(view, 36, 0); // internal attrs
  u32(view, 38, 0); // external attrs
  u32(view, 42, fitsU32(offset) ? offset : U32_MAX);
  buf.set(nameBytes, CENTRAL_FIXED);
  if (zip64) {
    const e = CENTRAL_FIXED + nameBytes.length;
    u16(view, e, ZIP64_EXTRA_ID);
    u16(view, e + 2, 24);
    u64(view, e + 4, size); // uncompressed
    u64(view, e + 12, size); // compressed
    u64(view, e + 20, offset); // смещение local header
  }
  return buf;
}

export function eocdRecord(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new Uint8Array(EOCD);
  const view = new DataView(buf.buffer);
  const countField = count >= U16_MAX ? U16_MAX : count;
  u32(view, 0, 0x06054b50);
  u16(view, 4, 0); // this disk
  u16(view, 6, 0); // disk with CD
  u16(view, 8, countField);
  u16(view, 10, countField);
  u32(view, 12, fitsU32(cdSize) ? cdSize : U32_MAX);
  u32(view, 16, fitsU32(cdOffset) ? cdOffset : U32_MAX);
  u16(view, 20, 0); // comment
  return buf;
}

/** zip64-версия EOCD: настоящие u64-значения там, где классика ушла в escape */
export function zip64EocdRecord(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new Uint8Array(ZIP64_EOCD);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x06064b50);
  u64(view, 4, ZIP64_EOCD - 12); // размер записи без сигнатуры и самого поля размера
  u16(view, 12, VERSION_ZIP64); // version made by
  u16(view, 14, VERSION_ZIP64); // version needed
  u32(view, 16, 0); // this disk
  u32(view, 20, 0); // disk with CD
  u64(view, 24, count); // записей на этом диске
  u64(view, 32, count);
  u64(view, 40, cdSize);
  u64(view, 48, cdOffset);
  return buf;
}

/** Локатор zip64 EOCD: читатель находит настоящий каталог даже при переполненном классическом */
export function zip64EocdLocator(zip64EocdOffset: number): Uint8Array {
  const buf = new Uint8Array(20);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x07064b50);
  u32(view, 4, 0); // диск с zip64 EOCD
  u64(view, 8, zip64EocdOffset);
  u32(view, 16, 1); // всего дисков
  return buf;
}

/**
 * Поток байт ZIP-архива из записей. Читает источник лениво: каждый pull
 * берёт следующую запись, поэтому потребитель (Response) может начать
 * отдавать клиенту первый файл, пока остальные ещё читаются с диска.
 */
export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = Symbol.asyncIterator in entries ? entries[Symbol.asyncIterator]() : entries[Symbol.iterator]();
  const central: Uint8Array[] = [];
  let offset = 0;
  let finished = false;

  const push = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) => {
    offset += chunk.length;
    controller.enqueue(chunk);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (value) {
          // Имя кодируем один раз: byteLength нужен и заголовку, и смещению
          // записи в центральном каталоге (name.length — символы, не байты)
          const nameBytes = new TextEncoder().encode(value.name.replaceAll("\\", "/"));
          const crc = crc32(value.data);
          const mtime = value.mtime ?? new Date();
          push(controller, localHeader(nameBytes, value.data.length, crc, mtime));
          push(controller, value.data);
          const recordOffset = offset - LOCAL_HEADER - nameBytes.length - value.data.length;
          central.push(centralRecord(nameBytes, value.data.length, crc, mtime, recordOffset));
        }
        if (done) {
          if (!finished) {
            finished = true;
            const cdOffset = offset;
            let cdSize = 0;
            for (const record of central) {
              push(controller, record);
              cdSize += record.length;
            }
            // Классические поля EOCD 16/32-битные: переполнились — пишем
            // zip64 EOCD + локатор перед классическим (его escape-поля читатель
            // отправляет к zip64-версии)
            if (central.length >= U16_MAX || !fitsU32(cdSize) || !fitsU32(cdOffset)) {
              const zip64EocdOffset = offset;
              push(controller, zip64EocdRecord(central.length, cdSize, cdOffset));
              push(controller, zip64EocdLocator(zip64EocdOffset));
            }
            push(controller, eocdRecord(central.length, cdSize, cdOffset));
          }
          controller.close();
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}

/**
 * Имя файла в архиве: порядковый префикс сохраняет хронологию сортировки
 */
export function zipEntryName(index: number, base: string, ext: string): string {
  const cleanBase = base.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "photo";
  const cleanExt = ext.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 5) || "jpg";
  return `${String(index).padStart(3, "0")}-${cleanBase}.${cleanExt}`;
}
