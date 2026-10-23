import { formatCents } from "./money";
import { SPLIT_CATEGORIES } from "./categories";
import type { SplitActivityDTO } from "./types";

// Текст журнала группы строится на клиенте из структурированных записей (lib/split/activity.ts пишет
// факты, а не фразы): имена и суммы показываются по актуальным данным, формулировки можно поправить задним числом.

export interface ActivityLine {
  emoji: string;
  text: string;
}

type Data = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const n = (v: unknown): number => (typeof v === "number" ? v : 0);

function changeText(c: Data, nameOf: (id: string) => string, currency: string): string | null {
  const money = (v: unknown) => formatCents(n(v), currency);
  switch (c.field) {
    case "amountCents":
      return `сумма ${money(c.from)} → ${money(c.to)}`;
    case "description":
      return `название «${s(c.from)}» → «${s(c.to)}»`;
    case "original": {
      // «USD:50000» → «500 $»; null — вернули в валюту группы
      const fmt = (v: unknown) => {
        const [cur, cents] = s(v).split(":");
        return cur && cents ? formatCents(Number(cents), cur) : "в валюте группы";
      };
      return `исходная сумма ${fmt(c.from)} → ${fmt(c.to)}`;
    }
    case "category":
      return `категория ${SPLIT_CATEGORIES[s(c.from)]?.label ?? "—"} → ${SPLIT_CATEGORIES[s(c.to)]?.label ?? "—"}`;
    case "paidById":
      return `платил(а) ${nameOf(s(c.from))} → ${nameOf(s(c.to))}`;
    case "spentOn":
      return `дата ${s(c.from).split("-").reverse().join(".")} → ${s(c.to).split("-").reverse().join(".")}`;
    case "note":
      return "заметка";
    case "split":
      return "деление";
    default:
      return null;
  }
}

export function describeActivity(a: SplitActivityDTO, nameOf: (id: string) => string, currency: string): ActivityLine {
  const d = a.data as Data;
  const who = a.actorId ? nameOf(a.actorId) : "Автоматически";
  const money = (v: unknown) => formatCents(n(v), currency);
  const title = (v: unknown) => `«${s(v)}»`;

  switch (a.type) {
    case "group.created":
      return { emoji: "✨", text: `${who} создал(а) группу` };
    case "group.updated":
      return { emoji: "⚙️", text: `${who} изменил(а) настройки группы` };
    case "expense.created":
      return d.recurring
        ? { emoji: "🔁", text: `Повторяющаяся трата ${title(d.description)} · ${money(d.amountCents)}` }
        : { emoji: "💸", text: `${who} добавил(а) ${title(d.description)} · ${money(d.amountCents)}` };
    case "expense.updated": {
      const changes = Array.isArray(d.changes)
        ? (d.changes as Data[]).flatMap((c) => {
            const t = changeText(c, nameOf, currency);
            return t ? [t] : [];
          })
        : [];
      return { emoji: "✏️", text: `${who} изменил(а) ${title(d.description)}${changes.length ? `: ${changes.join(", ")}` : ""}` };
    }
    case "expense.deleted":
      return { emoji: "🗑️", text: `${who} удалил(а) ${title(d.description)} · ${money(d.amountCents)}` };
    case "payment.created":
      return {
        emoji: "✅",
        text: `${who} записал(а) перевод: ${nameOf(s(d.fromId))} → ${nameOf(s(d.toId))} · ${money(d.amountCents)}${d.description ? ` за ${title(d.description)}` : ""}`,
      };
    case "payment.deleted":
      return { emoji: "↩️", text: `${who} отменил(а) перевод: ${nameOf(s(d.fromId))} → ${nameOf(s(d.toId))} · ${money(d.amountCents)}` };
    case "member.added":
      return { emoji: "➕", text: `${who} добавил(а) участника ${s(d.name)}` };
    case "member.joined":
      return { emoji: "👋", text: d.returned ? `${s(d.name)} вернул(а)сь в группу` : `${s(d.name)} присоединился(ась) к группе` };
    case "member.claimed":
      return { emoji: "🙋", text: `${nameOf(s(d.memberId))} зашёл(ла) в группу по приглашению` };
    case "member.left":
      return { emoji: "🚪", text: `${s(d.name)} вышел(ла) из группы` };
    case "member.removed":
      return { emoji: "🚫", text: `${who} убрал(а) участника ${s(d.name)}` };
    case "member.renamed":
      return { emoji: "🏷️", text: `${who} переименовал(а) ${s(d.from)} → ${s(d.to)}` };
    case "recurring.created":
      return { emoji: "🔁", text: `${who} создал(а) повтор ${title(d.description)} · ${money(d.amountCents)}` };
    case "recurring.updated":
      return { emoji: "🔁", text: `${who} изменил(а) повтор ${title(d.description)}` };
    case "recurring.deleted":
      return { emoji: "🔁", text: `${who} удалил(а) повтор ${title(d.description)}` };
    case "recurring.paused":
      return { emoji: "⏸️", text: `Повтор ${title(d.description)} на паузе: из шаблона вышел участник` };
    default:
      return { emoji: "•", text: "Событие в группе" };
  }
}
