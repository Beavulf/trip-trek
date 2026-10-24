import { afterEach, describe, expect, it } from "vitest";
import { criticalFreeBytes, diskLevel, fmtDiskBytes, readDiskSpace, type DiskSpace } from "./disk-space";
import { photoLimitPerTrip, photoQuotaError } from "./photo-limits";

const GIB = 1024 ** 3;
const disk = (freeGiB: number, totalGiB = 40): DiskSpace => ({ freeBytes: freeGiB * GIB, totalBytes: totalGiB * GIB });

afterEach(() => {
  delete process.env.PHOTO_MIN_FREE_MB;
  delete process.env.PHOTO_LIMIT_PER_TRIP;
});

describe("diskLevel", () => {
  it("много места — ok", () => {
    expect(diskLevel(disk(20))).toBe("ok");
  });

  it("меньше 3 ГБ или 15% — low (предупреждаем админа, загрузки идут)", () => {
    expect(diskLevel(disk(2.5))).toBe("low");
    expect(diskLevel(disk(5, 40))).toBe("low"); // 12,5% диска
    expect(diskLevel(disk(6, 40))).toBe("ok"); // ровно 15%
  });

  it("меньше 1 ГБ — critical (загрузки отклоняем)", () => {
    expect(diskLevel(disk(0.5))).toBe("critical");
  });

  it("порог critical меняется переменной PHOTO_MIN_FREE_MB", () => {
    process.env.PHOTO_MIN_FREE_MB = "2048";
    expect(criticalFreeBytes()).toBe(2048 * 1024 * 1024);
    expect(diskLevel(disk(1.5))).toBe("critical");
  });

  it("не удалось прочитать диск — не блокируем", () => {
    expect(diskLevel(null)).toBe("ok");
    expect(diskLevel({ freeBytes: 0, totalBytes: 0 })).toBe("ok");
  });
});

describe("readDiskSpace", () => {
  it("читает диск существующего каталога", async () => {
    const d = await readDiskSpace("/");
    expect(d).not.toBeNull();
    expect(d!.totalBytes).toBeGreaterThan(0);
    expect(d!.freeBytes).toBeLessThanOrEqual(d!.totalBytes);
  });

  it("несуществующий каталог — берёт ближайший родитель", async () => {
    const d = await readDiskSpace("/tmp/definitely-not-existing-dir/uploads/photos");
    expect(d).not.toBeNull();
  });
});

describe("fmtDiskBytes", () => {
  it("ГБ с запятой и МБ", () => {
    expect(fmtDiskBytes(12.34 * GIB)).toBe("12,3 ГБ");
    expect(fmtDiskBytes(850 * 1024 ** 2)).toBe("850 МБ");
  });
});

describe("photoQuotaError", () => {
  it("до предела — null, на пределе и выше — текст с числами", () => {
    expect(photoQuotaError(10, 1500)).toBeNull();
    expect(photoQuotaError(1499, 1500)).toBeNull();
    expect(photoQuotaError(1500, 1500)).toMatch(/1500/);
  });

  it("предел по умолчанию 1500, меняется переменной; мусор игнорируется", () => {
    expect(photoLimitPerTrip()).toBe(1500);
    process.env.PHOTO_LIMIT_PER_TRIP = "300";
    expect(photoLimitPerTrip()).toBe(300);
    process.env.PHOTO_LIMIT_PER_TRIP = "abc";
    expect(photoLimitPerTrip()).toBe(1500);
    process.env.PHOTO_LIMIT_PER_TRIP = "-5";
    expect(photoLimitPerTrip()).toBe(1500);
  });
});
