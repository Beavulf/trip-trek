// Гейт свежести карты проекта: поле "Last verified: YYYY-MM-DD" в шапке AGENTS.md
// должно обновляться после реальной сверки с кодом, иначе карта тихо гниёт.
// Чистая функция без node:*, чтобы тест шёл в vitest (src/**/*.test.ts),
// а скрипт scripts/docs-check.mjs импортировал её же — одна логика, две точки входа.

export const DOCS_MAX_AGE_DAYS = 14;

/** Дата из первого "Last verified: YYYY-MM-DD" в тексте или null. */
export function parseLastVerified(text: string): string | null {
  const m = /\bLast verified:\s*(\d{4}-\d{2}-\d{2})\b/.exec(text);
  return m ? m[1] : null;
}

/** Календарная разница в днях между двумя датами YYYY-MM-DD; null, если дата битая. */
export function verificationAgeDays(verified: string, today: string): number | null {
  // Date.UTC молча заворачивает 13-й месяц и 40-й день — состав даты проверяем явно
  const ts = [verified, today].map((s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const y = Number(s.slice(0, 4)), mo = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.getTime() : null;
  });
  if (ts[0] === null || ts[1] === null) return null;
  return Math.round((ts[1] - ts[0]) / 86_400_000);
}

export type FreshnessVerdict = {
  ok: boolean;
  verified: string | null;
  ageDays: number | null;
  reason: string;
};

/** Вердикт по тексту дока: нет поля, битая дата, дата из будущего, устарела, ок. */
export function freshnessVerdict(text: string, today: string, maxAgeDays = DOCS_MAX_AGE_DAYS): FreshnessVerdict {
  const verified = parseLastVerified(text);
  if (!verified) {
    return { ok: false, verified: null, ageDays: null, reason: "нет поля «Last verified: YYYY-MM-DD» в шапке" };
  }
  const ageDays = verificationAgeDays(verified, today);
  if (ageDays === null) {
    return { ok: false, verified, ageDays: null, reason: `битая дата Last verified: ${verified}` };
  }
  if (ageDays < 0) {
    return { ok: false, verified, ageDays, reason: `Last verified ${verified} в будущем — опечатка?` };
  }
  if (ageDays > maxAgeDays) {
    return {
      ok: false,
      verified,
      ageDays,
      reason: `Last verified ${verified} старше ${maxAgeDays} дн. — сверь док с кодом и обнови дату только после реальной сверки`,
    };
  }
  return { ok: true, verified, ageDays, reason: `свежо (${verified}, ${ageDays} дн.)` };
}
