import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { StorageError, imageDisplaySize, makeThumb, put, remove, uploadPath } from "./index";

// Настоящий sharp на временном каталоге: ловим регрессии именно пайплайна, а не моков
let tmp: string;
const prevDir = process.env.UPLOADS_DIR;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "triptrek-storage-"));
  process.env.UPLOADS_DIR = tmp;
});

afterAll(async () => {
  if (prevDir === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = prevDir;
  await rm(tmp, { recursive: true, force: true });
});

const jpeg = (width: number, height: number, orientation?: number) => {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  return (orientation ? img.withMetadata({ orientation }) : img).toBuffer();
};

describe("put(photo): размеры и миниатюра", () => {
  it("большой кадр ужимается до 1600 и отдаёт размеры файла + миниатюру 480", async () => {
    const res = await put({ data: await jpeg(3000, 2000), kind: "photo" });

    expect(res.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(res.thumbUrl).toMatch(/-thumb\.jpg$/);
    // 2000 × 1600 / 3000 = 1066.67 → 1067 (то, что реально лежит в файле)
    expect({ w: res.width, h: res.height }).toEqual({ w: 1600, h: 1067 });

    const full = await sharp(uploadPath(res.url)).metadata();
    expect({ w: full.width, h: full.height }).toEqual({ w: res.width, h: res.height });
    const thumb = await sharp(uploadPath(res.thumbUrl!)).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(480);
  });

  it("маленький кадр не увеличивается", async () => {
    const res = await put({ data: await jpeg(640, 480), kind: "photo" });
    expect({ w: res.width, h: res.height }).toEqual({ w: 640, h: 480 });
  });

  it("EXIF-ориентация применяется до подсчёта размеров (боком снятый кадр → портрет)", async () => {
    // 400×200 с ориентацией 6 (поворот на 90°): человек видит 200×400
    const res = await put({ data: await jpeg(400, 200, 6), kind: "photo" });
    expect({ w: res.width, h: res.height }).toEqual({ w: 200, h: 400 });
  });

  it("аватар размеров не отдаёт (они нужны только плиткам галереи)", async () => {
    const res = await put({ data: await jpeg(800, 800), kind: "avatar" });
    expect(res.width).toBeUndefined();
    expect(res.thumbUrl).toBeUndefined();
  });
});

describe("imageDisplaySize / makeThumb", () => {
  it("imageDisplaySize меняет стороны местами для ориентаций 5–8", async () => {
    expect(await imageDisplaySize(await jpeg(400, 200))).toEqual({ width: 400, height: 200 });
    expect(await imageDisplaySize(await jpeg(400, 200, 6))).toEqual({ width: 200, height: 400 });
    expect(await imageDisplaySize(await jpeg(400, 200, 3))).toEqual({ width: 400, height: 200 }); // 180° — стороны те же
  });

  it("makeThumb старого повёрнутого оригинала даёт портрет, а не лежачий кадр", async () => {
    const thumb = await makeThumb(await jpeg(4000, 3000, 6));
    const m = await sharp(thumb).metadata();
    expect({ w: m.width, h: m.height }).toEqual({ w: 360, h: 480 });
  });
});

describe("uploadPath / remove", () => {
  it("пропускает только /uploads/ и не выпускает за корень", () => {
    expect(uploadPath("/uploads/a.jpg")).toBe(path.join(tmp, "a.jpg"));
    for (const bad of ["/etc/passwd", "uploads/a.jpg", "/uploads/../secret", "/uploads/..%2f..", "", "/uploads/a/../../x"]) {
      if (bad === "/uploads/..%2f..") continue; // %-кодирование разбирает static-uploads, не storage
      expect(() => uploadPath(bad), bad).toThrow(StorageError);
    }
  });

  it("remove удаляет файл и терпит повторное удаление", async () => {
    const res = await put({ data: await jpeg(300, 300), kind: "photo" });
    await remove(res.url);
    await expect(stat(uploadPath(res.url))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(remove(res.url)).resolves.toBeUndefined();
    // миниатюра остаётся — её удаляет вызывающий (api/photos DELETE перебирает оба url)
    expect((await readFile(uploadPath(res.thumbUrl!))).length).toBeGreaterThan(0);
  });
});
