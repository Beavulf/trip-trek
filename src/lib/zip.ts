// Минимальный ZIP-писатель без зависимостей (метод STORE).
// JPEG/PNG уже сжаты — deflate только жёг бы CPU на слабом сервере.
// Архив собирается потоком: в памяти лежат заголовки центрального каталога
// (сотни байт на файл) и ОДИН текущий файл — сотни фото не раздувают heap.
// Формат — APPNOTE.TXT: local header → data → central directory → EOCD.

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

// LOCAL_HEADER + имя; FIXED — общий размер всех заголовков без имени
const LOCAL_HEADER = 30;
const CENTRAL_FIXED = 46;
const EOCD = 22;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;

function localHeader(nameBytes: Uint8Array, size: number, crc: number, mtime: Date): Uint8Array {
  const buf = new Uint8Array(LOCAL_HEADER + nameBytes.length);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(mtime);
  u32(view, 0, 0x04034b50);
  u16(view, 4, 20); // version needed
  u16(view, 6, UTF8_FLAG);
  u16(view, 8, STORE_METHOD);
  u16(view, 10, time);
  u16(view, 12, date);
  u32(view, 14, crc);
  u32(view, 18, size); // compressed
  u32(view, 22, size); // uncompressed
  u16(view, 26, nameBytes.length);
  u16(view, 28, 0); // extra length
  buf.set(nameBytes, LOCAL_HEADER);
  return buf;
}

function centralRecord(nameBytes: Uint8Array, size: number, crc: number, mtime: Date, offset: number): Uint8Array {
  const buf = new Uint8Array(CENTRAL_FIXED + nameBytes.length);
  const view = new DataView(buf.buffer);
  const { time, date } = dosDateTime(mtime);
  u32(view, 0, 0x02014b50);
  u16(view, 4, 20); // version made by
  u16(view, 6, 20); // version needed
  u16(view, 8, UTF8_FLAG);
  u16(view, 10, STORE_METHOD);
  u16(view, 12, time);
  u16(view, 14, date);
  u32(view, 16, crc);
  u32(view, 20, size);
  u32(view, 24, size);
  u16(view, 28, nameBytes.length);
  u16(view, 30, 0); // extra
  u16(view, 32, 0); // comment
  u16(view, 34, 0); // disk number start
  u16(view, 36, 0); // internal attrs
  u32(view, 38, 0); // external attrs
  u32(view, 42, offset);
  buf.set(nameBytes, CENTRAL_FIXED);
  return buf;
}

function eocdRecord(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new Uint8Array(EOCD);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x06054b50);
  u16(view, 4, 0); // this disk
  u16(view, 6, 0); // disk with CD
  u16(view, 8, count);
  u16(view, 10, count);
  u32(view, 12, cdSize);
  u32(view, 16, cdOffset);
  u16(view, 20, 0); // comment
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
