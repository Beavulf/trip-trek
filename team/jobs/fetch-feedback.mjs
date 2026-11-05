#!/usr/bin/env bun
// Дайджест новых отзывов из прода (read-only). Запуск:
//   bun team/jobs/fetch-feedback.mjs [--since YYYY-MM-DD]
//
// Почему так устроено:
// - прод читаем только через SSH-алиас `triptrek` и psql внутри транзакции
//   READ ONLY — это зафиксированное решение владельца («читать можно, менять —
//   только по отдельному запросу»), см. team/policies/prod-readonly.md;
// - запрос зашит в коде, а не передаётся параметром: любая новая выборка —
//   правка этого файла через таск с ревью, а не флаг запуска (interfaces.md, R12.1);
// - сбой SSH/SQL фиксируем и сообщаем (stderr, exit 1) без ретраев в обход и
//   без смены конфигурации (R11.1);
// - email и имена попадают только в raw/ (игнорируется git) и только если они
//   есть в записи; в дайджест — то, что нужно для ответа: id, тип, статус,
//   дата, текст и способ связи, без домыслов (interfaces.md, обезличивание).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const INBOX_DIR = path.join(ROOT, "team", "inbox", "feedback");
const RAW_DIR = path.join(INBOX_DIR, "raw");
const SSH_ALIAS = "triptrek";
const SSH_TIMEOUT_MS = 60_000;
const DEFAULT_WINDOW_HOURS = 26;

function fail(message) {
  console.error(`fetch-feedback: ${message}`);
  process.exit(1);
}

// --since YYYY-MM-DD задаёт начало окна как 00:00 этой даты по Минску —
// владелец мыслит датами в своём поясе; без флага берём последние 26 часов,
// чтобы ежедневный вечерний запуск не терял вечерние отзывы предыдущих суток.
function parseSince(argv) {
  const idx = argv.indexOf("--since");
  if (idx === -1) {
    return new Date(Date.now() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000);
  }
  const value = argv[idx + 1];
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail("ожидаю --since YYYY-MM-DD (например: --since 2026-11-01)");
  }
  return new Date(`${value}T00:00:00+03:00`); // Минск без летнего времени, всегда UTC+3
}

// Единственный SELECT джобы. JOIN "User" — только ради отображаемого имени
// (уходит в raw, не в дайджест). Даты отдаём через to_char в ISO: иначе psql
// печатает timestamptz как "…+00", который new Date() разбирает ненадёжно.
function buildSql(sinceIso) {
  return `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."createdAt"), '[]'::json)::text
FROM (
  SELECT f."id", f."type", f."status", f."message", f."contactEmail",
         f."userId", u."name" AS "userName",
         to_char(f."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
         to_char(f."lastActivityAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastActivityAt"
  FROM "Feedback" f
  LEFT JOIN "User" u ON u."id" = f."userId"
  WHERE f."createdAt" > TIMESTAMPTZ '${sinceIso}'
  ORDER BY f."createdAt" ASC
) t;
COMMIT;
`;
}

// SQL уходит на stdin psql (`docker exec -i`), чтобы не мучиться с двойным
// экранированием кавычек через ssh. ON_ERROR_STOP=1 — иначе psql при ошибке
// SQL продолжит и завершится с кодом 0, и мы примем сбой за пустую выборку.
function runSsh(sql) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ssh",
      [
        SSH_ALIAS,
        "docker exec -i triptrek-db psql -X -v ON_ERROR_STOP=1 -U triptrek -d triptrek -t -A",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`ssh не ответил за ${SSH_TIMEOUT_MS / 1000}с`));
    }, SSH_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ssh завершился с кодом ${code}: ${stderr.trim() || "без сообщения"}`));
      } else {
        resolve(stdout);
      }
    });
    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

// С -t -A psql печатает только строку результата, но BEGIN/COMMIT могут
// оставить служебные строки — берём строку с JSON, остальное не наше.
function parseItems(stdout) {
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("["));
  if (!line) {
    fail("psql не вернул JSON-строку результата — вывод неожиданный, скрипт не менялся?");
  }
  try {
    return JSON.parse(line);
  } catch {
    fail("не смог разобрать JSON из psql — вывод неожиданный, скрипт не менялся?");
  }
}

// Минск живёт на UTC+3 без переходов на летнее время — считаем сдвигом,
// не полагаясь на ICU конкретного рантайма.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const pad2 = (n) => String(n).padStart(2, "0");

function mskNow() {
  return new Date(Date.now() + MSK_OFFSET_MS);
}

function formatMsk(dateInput) {
  const d = new Date(new Date(dateInput).getTime() + MSK_OFFSET_MS);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function mskDateKey() {
  const d = mskNow();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function mskTimeStamp() {
  const d = mskNow();
  return `${pad2(d.getUTCHours())}-${pad2(d.getUTCMinutes())}-${pad2(d.getUTCSeconds())}`;
}

// Способ связи — без переноса email/имён в дайджест: гостю владелец отвечает
// по email из raw-файла, пользователю приложения — в переписке обращения.
function contactLine(item) {
  if (item.userId) {
    return `пользователь приложения, ответ — в переписке обращения (userId: ${item.userId})`;
  }
  if (item.contactEmail) {
    return "гость — email лежит в raw-файле этого запуска (в дайджест не переносим)";
  }
  return "гость без контакта — ответить нельзя";
}

function buildDigestSection(items, since) {
  const lines = [];
  lines.push(`## Запуск ${formatMsk(new Date())} (Минск) — новых обращений: ${items.length}`);
  lines.push("");
  lines.push(`Окно: обращения, созданные после ${formatMsk(since)} (Минск).`);
  for (const item of items) {
    lines.push("");
    lines.push(`### #${item.id} · ${item.type} · ${item.status}`);
    lines.push(`- Дата: ${formatMsk(item.createdAt)} (Минск)`);
    lines.push(`- Контакт для ответа: ${contactLine(item)}`);
    // Текст переносим как есть, без домыслов; переносы строк отступаем,
    // чтобы пункт списка не разваливался.
    lines.push(`- Текст: ${String(item.message).replace(/\n/g, "\n  ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const since = parseSince(process.argv.slice(2));

  let stdout;
  try {
    stdout = await runSsh(buildSql(since.toISOString()));
  } catch (err) {
    fail(`не удалось прочитать прод: ${err.message}`);
  }
  const items = parseItems(stdout);

  if (items.length === 0) {
    // R08.1: новых нет — файла не создаём, только строка в stdout.
    console.log("новых отзывов нет");
    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  const dateKey = mskDateKey();
  const rawName = `${dateKey}T${mskTimeStamp()}.json`;
  const rawPath = path.join(RAW_DIR, rawName);
  await writeFile(
    rawPath,
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), since: since.toISOString(), items },
      null,
      2,
    ),
  );

  const digestPath = path.join(INBOX_DIR, `${dateKey}.md`);
  if (!existsSync(digestPath)) {
    await writeFile(
      digestPath,
      `# Дайджест отзывов — ${dateKey}\n\nИсточник: прод, read-only (team/jobs/fetch-feedback.mjs). ` +
        `Сырые данные (email, имена) — в raw/, в git не коммитятся.\n\n`,
    );
  }
  await appendFile(digestPath, `${buildDigestSection(items, since)}\n`);

  console.log(`дайджест: team/inbox/feedback/${dateKey}.md (обращений: ${items.length}; raw: raw/${rawName})`);
}

main();
