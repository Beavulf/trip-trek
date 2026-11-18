// Механическая сверка «доки ↔ код». Запуск: bun run docs:check [--base <ref>]
//
// Что проверяет:
//  1) гейт свежести: Last verified в шапке AGENTS.md не старше 14 дней
//     (правило: бампать дату только после реальной сверки);
//  2) пути из ключевых доков существуют (с вариантами расширений);
//  3) относительные md-ссылки ключевых доков разрешаются;
//  4) §-ссылки на architecture.md / DEPLOY.md указывают на существующие разделы;
//  5) символы из git-диффа (роуты, модели Prisma, новые src/lib-модули, скрипты
//     package.json) упомянуты в профильных доках — «дока обновлена тем же коммитом»;
//  6) team/roles/ менялся → bun team/sync.mjs --check.
//
// Последний блок вывода ВСЕГДА печатает напоминание о финальном шаге — агент
// видит вывод команды, и это нельзя «пробежать глазами».

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { freshnessVerdict } from "../src/lib/docs-freshness.ts";

const root = path.resolve(import.meta.dirname, "..");
const errors = [];
const notes = [];

const read = (p) => readFileSync(path.join(root, p), "utf8");
const exists = (p) => existsSync(path.join(root, p));

// ── 1. Гейт свежести ─────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10); // календарный день UTC — как и даты в доках
const agents = read("AGENTS.md");
const fresh = freshnessVerdict(agents, today);
if (!fresh.ok) errors.push(`AGENTS.md: ${fresh.reason}`);
else notes.push(`Свежесть AGENTS.md: ${fresh.reason}`);

// ── 2. Пути из доков ─────────────────────────────────────────────────────────
// Имена модулей пишутся без расширения (`src/lib/premium`), поэтому пробуем варианты.
const EXTS = ["", ".ts", ".tsx", ".md", ".mjs", ".js", ".prisma", ".yml", ".yaml", ".json", ".sh", "/index.ts", "/README.md"];
const PATH_RE = /(?<!@)((?:src|docs|server|prisma|team|docker-deploy|scripts|public|patches|\.github|\.agents|\.claude)\/[A-Za-z0-9_\-.\/\[\]]+?)(?=[\s),;:`"'\\\]]|$)/g;
// Пути, которых в репо быть не должно, но они легитимны: машинно-локальные/рантайм-каталоги.
const PATH_ALLOW = new Set(["prisma/db/dev.db", "public/uploads", "prisma/db"]);

function pathExists(p) {
  if (PATH_ALLOW.has(p)) return true;
  if (EXTS.some((e) => exists(p + e))) return true;
  // «docs/adr/0001» — легальная ссылка-префикс на docs/adr/0001-slug.md
  const pref = /^(docs\/adr\/\d{4})$/.exec(p);
  if (pref) {
    try {
      const dir = execFileSync("git", ["ls-files", "docs/adr"], { cwd: root, encoding: "utf8" });
      if (dir.split("\n").some((f) => f.startsWith(pref[1]))) return true;
    } catch { /* нет git — проверим как есть */ }
  }
  return false;
}

function checkPaths(doc) {
  const text = read(doc);
  const seen = new Set();
  for (const m of text.matchAll(PATH_RE)) {
    let p = m[1].replace(/[.,\]]+$/, "");
    if (p.endsWith("/") || p.endsWith("-") || seen.has(p)) continue;
    seen.add(p);
    if (p.includes("*") || /\b(NNNN|slug|token|tripId|groupId|memberId)\b/.test(p)) continue;
    if (pathExists(p)) continue;
    errors.push(`${doc}: путь «${p}» не найден в репо (опечатка или док отстал от кода)`);
  }
  return seen.size;
}

// ── 3. Относительные md-ссылки ───────────────────────────────────────────────
function checkLinks(doc) {
  const text = read(doc);
  const base = path.dirname(path.join(root, doc));
  const seen = new Set();
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)\s]*)?\)/g)) {
    const href = m[1];
    if (href.startsWith("http") || href.startsWith("/")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    if (!existsSync(path.resolve(base, href))) errors.push(`${doc}: битая ссылка → ${href}`);
  }
}

// ── 4. §-ссылки ──────────────────────────────────────────────────────────────
function checkSectionRefs(targetDoc, sections) {
  const text = read(targetDoc);
  for (const n of sections) {
    const re = new RegExp(`^##\\s*${n}\\.`, "m");
    if (!re.test(text)) errors.push(`${targetDoc}: нет раздела «## ${n}.», на который кто-то ссылается (§${n})`);
  }
}

const REPO_DOCS = ["AGENTS.md", "README.md", "docs/api.md", "docs/architecture.md", "docs/glossary.md", "docker-deploy/DEPLOY.md", "team/README.md"];

for (const doc of REPO_DOCS) {
  if (!exists(doc)) {
    errors.push(`ключевой док «${doc}» исчез — поправь список REPO_DOCS в scripts/docs-check.mjs`);
    continue;
  }
  const paths = checkPaths(doc);
  checkLinks(doc);
  notes.push(`${doc}: пути (${paths}) и ссылки ок`);
}

// Кто на какие § ссылается — собираем по всем md репо (кроме архива).
// git ls-files проще и быстрее рекурсии по fs; незакоммиченные новые файлы не критичны для §-ссылок.
const mdFiles = [];
const listed = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
for (const f of listed) {
  if (f.startsWith("docs/archive/") || !exists(f)) continue;
  mdFiles.push(f);
}
const archSections = new Set();
const deploySections = new Set();
for (const f of mdFiles) {
  const text = read(f);
  // § должен стоять вплотную к имени дока (через закрывающий бэктик — можно),
  // иначе «DEPLOY.md и §10 architecture.md» припишет §10 не тому доку.
  for (const m of text.matchAll(/architecture\.md`?\s*§\s*(\d+)|§\s*(\d+)\s*`?\s*architecture\.md/g)) {
    const n = m[1] || m[2];
    if (n) archSections.add(n);
  }
  for (const m of text.matchAll(/DEPLOY\.md`?\s*§\s*(\d+)|§\s*(\d+)\s*`?\s*DEPLOY\.md/g)) {
    const n = m[1] || m[2];
    if (n) deploySections.add(n);
  }
}
checkSectionRefs("docs/architecture.md", archSections);
checkSectionRefs("docker-deploy/DEPLOY.md", deploySections);
if (archSections.size) notes.push(`§-ссылки на architecture.md: разделы ${[...archSections].join(", ")} на месте`);

// ── 5. Символы из git-диффа → упоминание в доках ─────────────────────────────
const baseArgIdx = process.argv.indexOf("--base");
const baseRef = baseArgIdx > -1 ? process.argv[baseArgIdx + 1] : "HEAD";
let changed = [];
try {
  // имена изменённых файлов: рабочее дерево + индекс (или диапазон от --base)
  const out = execFileSync("git", ["diff", "--name-only", "--merge-base", baseRef], { cwd: root, encoding: "utf8" });
  changed = out.split("\n").filter(Boolean);
} catch {
  notes.push(`git diff от ${baseRef} не удался — проверку символов пропускаю`);
}

const changedText = (f) => {
  try {
    // только добавленные строки: «дока должна упомянуть то, что добавили»
    return execFileSync("git", ["diff", "--merge-base", baseRef, "-U0", "--", f], { cwd: root, encoding: "utf8" });
  } catch {
    return "";
  }
};

const addedLines = (f) =>
  changedText(f)
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));

const apiMd = read("docs/api.md");
const archMd = read("docs/architecture.md");

for (const f of changed) {
  if (f.startsWith("src/app/api/") && f.endsWith("route.ts")) {
    const route = f.replace(/^src\/app\/api\//, "").replace(/\/route\.ts$/, "");
    if (!apiMd.includes(route)) errors.push(`docs/api.md: роут «${route}» изменён в диффе, но в api.md не упомянут`);
  } else if (f.startsWith("src/app/p/") && f.endsWith("route.ts")) {
    const route = f.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "");
    if (!apiMd.includes(route)) errors.push(`docs/api.md: гостевой роут «${route}» изменён, но в api.md не упомянут`);
  } else if (f === "prisma/schema.prisma") {
    for (const line of addedLines(f)) {
      const m = /^\s*model\s+(\w+)/.exec(line);
      if (m && !archMd.includes(m[1])) errors.push(`docs/architecture.md: новая модель «${m[1]}» не упомянута в §5`);
    }
  } else if (f.startsWith("src/lib/") && f.endsWith(".ts") && !f.includes(".test.") && !exists(f)) {
    // новый модуль (в HEAD его ещё нет) → должен попасть в карту AGENTS.md
    const name = path.basename(f, ".ts");
    if (!agents.includes(name)) errors.push(`AGENTS.md: новый модуль «${name}» (${f}) не упомянут в карте репозитория`);
  } else if (f === "package.json") {
    // Сравниваем ключи секции scripts: base vs рабочее дерево (diff строк цепляет зависимости)
    const scriptsOf = (ref) => {
      try {
        return Object.keys(JSON.parse(execFileSync("git", ["show", `${ref}:package.json`], { cwd: root, encoding: "utf8" })).scripts ?? {});
      } catch {
        return [];
      }
    };
    const before = new Set(scriptsOf(baseRef));
    const current = JSON.parse(read("package.json")).scripts ?? {};
    for (const name of Object.keys(current)) {
      if (!before.has(name) && !agents.includes(name) && !["dev", "build", "start"].includes(name)) {
        errors.push(`AGENTS.md: новый npm-скрипт «${name}» не описан в «Командах»`);
      }
    }
  } else if (f.startsWith("team/roles/")) {
    // ── 6. Роли менялись → синк платформенных копий обязателен
    try {
      execFileSync("bun", ["team/sync.mjs", "--check"], { cwd: root, stdio: "pipe" });
      notes.push("team/roles изменялся — team/sync.mjs --check зелёный");
    } catch {
      errors.push("team/roles/ изменён, но платформенные копии не синхронизированы — запусти `bun team/sync.mjs`");
    }
  }
}

// ── Вердикт ──────────────────────────────────────────────────────────────────
console.log("== docs:check ==");
for (const n of notes) console.log("  ·", n);
if (errors.length) {
  console.log(`\nОШИБОК: ${errors.length}`);
  for (const e of errors) console.log("  ✗", e);
} else {
  console.log("\nOK: доки сходятся с кодом");
}

// Финальный шаг — печатается ВСЕГДА, даже без ошибок: вывод команды читает агент.
console.log(`
──────────────────────────────────────────────────────────
ФИНАЛЬНЫЙ ШАГ ЗАДАЧИ (не пропускать):
 1. Сверь AGENTS.md и профильные доки со своими правками (таблица
    «Поддержание документации» в AGENTS.md).
 2. Обнови «Last verified» в AGENTS.md ТОЛЬКО если реально сверил.
 3. Прогони bun run docs:check ещё раз.
──────────────────────────────────────────────────────────`);

process.exit(errors.length ? 1 : 0);
