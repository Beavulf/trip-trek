// Форматирование размеров диска. Отдельный файл без node:fs: его импортирует клиентская админка,
// а disk-space.ts читает диск сервера и в браузерный бандл попасть не должен.

const GIB = 1024 ** 3;

/** «12,3 ГБ» / «850 МБ». */
export function fmtDiskBytes(n: number): string {
  if (n >= GIB) return `${(n / GIB).toFixed(1).replace(".", ",")} ГБ`;
  return `${Math.round(n / 1024 ** 2)} МБ`;
}
