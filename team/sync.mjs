#!/usr/bin/env bun
// team/sync.mjs — генерация платформенных точек запуска ролей из team/roles/*.md.
// Почему: единый источник истины ролей — team/roles/; три платформенные копии
// (.claude/agents, .github/agents, .agents/skills) никогда не правятся руками,
// иначе они расходятся (история 13, R14i).
//
//   bun team/sync.mjs          — перезаписать сгенерированные файлы
//   bun team/sync.mjs --check  — проверить расхождение: exit 1 + имя файла, если разошлись
//
// Без зависимостей: только node:fs/node:path. Форматы frontmatter платформ
// зафиксированы в interfaces.md и сняты с файлов v1.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rolesDir = join(root, "team", "roles");

// Человекочитаемые имена ролей для Copilot: его поле name — не slug, а заголовок.
const COPILOT_TITLES = {
  strategist: "TripTrek Strategist",
  architect: "TripTrek Architect",
  engineer: "TripTrek Engineer",
  reviewer: "TripTrek Reviewer",
  growth: "TripTrek Growth",
  support: "TripTrek Support",
};

function fail(message) {
  console.error(`sync: ${message}`);
  process.exit(1);
}

// Разбор роли: плоский YAML-frontmatter (name, description, tools) + тело-промпт.
// Значения храним сырыми (как в источнике, вместе с кавычками) — так вывод
// побайтово повторяет вход и --check не ловит ложных расхождений.
function parseRole(role) {
  const file = join(rolesDir, `${role}.md`);
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) fail(`${role}.md: нет YAML-frontmatter (--- ... ---)`);
  const fm = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  if (fm.name !== `triptrek-${role}`)
    fail(`${role}.md: frontmatter name "${fm.name}" не совпадает с именем файла`);
  for (const key of ["description", "tools"]) {
    if (!fm[key]) fail(`${role}.md: в frontmatter нет поля ${key}`);
  }
  // Тело нормализуем (без пустых строк по краям, один перевод строки в конце) —
  // иначе --check будет зависеть от того, как редактор сохранил края файла.
  const body = match[2].replace(/^\n+/, "").replace(/\n*$/, "\n");
  return { fm, body };
}

// Шапка-обёртка: помечает файл сгенерированным и указывает источник правок.
function banner(role, targetPath) {
  return (
    `> Сгенерировано из \`team/roles/${role}.md\` в \`${targetPath}\` ` +
    `командой \`bun team/sync.mjs\` — не править вручную.\n\n`
  );
}

function renderClaude(role, { fm, body }) {
  const path = `.claude/agents/${fm.name}.md`;
  return {
    path,
    content: `---\nname: ${fm.name}\ndescription: ${fm.description}\ntools: ${fm.tools}\n---\n\n${banner(role, path)}${body}`,
  };
}

function renderCopilot(role, { fm, body }) {
  const path = `.github/agents/${fm.name}.agent.md`;
  return {
    path,
    content:
      `---\nname: "${COPILOT_TITLES[role]}"\ndescription: ${fm.description}\n` +
      `tools: [read, search]\nuser-invocable: true\n---\n\n${banner(role, path)}${body}`,
  };
}

function renderKimi(role, { fm, body }) {
  const path = `.agents/skills/${fm.name}/SKILL.md`;
  return {
    path,
    content: `---\nname: ${fm.name}\ndescription: ${fm.description}\n---\n\n${banner(role, path)}${body}`,
  };
}

const roles = readdirSync(rolesDir)
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.replace(/\.md$/, ""))
  .sort();
if (roles.length === 0) fail(`в ${rolesDir} нет ролей (*.md)`);

const targets = [];
for (const role of roles) {
  if (!COPILOT_TITLES[role])
    fail(`${role}.md: нет отображаемого имени для Copilot — добавь в COPILOT_TITLES в sync.mjs`);
  const parsed = parseRole(role);
  targets.push(renderClaude(role, parsed), renderCopilot(role, parsed), renderKimi(role, parsed));
}

const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const stale = [];
  for (const target of targets) {
    let onDisk = null;
    try {
      onDisk = readFileSync(join(root, target.path), "utf8").replace(/\r\n/g, "\n");
    } catch {
      // файла нет — это тоже расхождение
    }
    if (onDisk !== target.content) stale.push(target.path);
  }
  if (stale.length > 0) {
    console.error(`sync --check: расхождение с team/roles/:\n  ${stale.join("\n  ")}`);
    console.error("Запусти: bun team/sync.mjs");
    process.exit(1);
  }
  console.log(`sync --check: OK, ${targets.length} файлов совпадают с team/roles/`);
} else {
  for (const target of targets) {
    const full = join(root, target.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, target.content);
    console.log(`sync: ${target.path}`);
  }
}
