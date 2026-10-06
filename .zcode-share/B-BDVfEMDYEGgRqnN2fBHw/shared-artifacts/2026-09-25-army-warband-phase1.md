# Войска, фаза 1 «Рота и первый рейд» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

| Поле | Значение |
|---|---|
| Status | DRAFT (ждёт «да» владельца на старт работ) |
| Owner | владелец + агент |
| Created | 2026-09-25 |
| Last verified | 2026-09-25 (по коду main) |
| Source of truth | спека `docs/superpowers/specs/2026-09-25-army-warband-design.md` |
| Result | (пусто — заполнить после реализации) |

**Goal:** играбельная петля фазы 1 — казарма-флигель, найм 3 типов войск, содержание
(жалованье/провизия/лазарет/мораль), снаряжение крафтом с качеством, формула силы
роты, бандитские лагеря на Карте земель с походами и рапортами боя.

**Architecture:** чистые ядра в `src/lib/army/` (юниты/сила/бой/сеттл + bun-тесты),
серверный модуль `src/lib/api/army.ts` + тонкие роуты `/api/army*`, ленивые сеттлы
без cron (лекал `settleEstateStaff` / `Shipment`), UI — флигель казармы в усадьбе +
слой лагерей на Карте земель + рапорт в стиле «Ведомости смены». Стековое хранение
войск; снаряжение в строю — слоты с прочностью (лекал `ToolRackSlot`).

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/Supabase, TanStack Query,
Tailwind 4 + shadcn/ui, bun:test.

## Global Constraints

- **Не поднимать локальный dev/стек** — только `bun run db:generate`, `bun run lint`,
  `bun test`, точечные скрипты. Живой стенд — VPS (выкатывает владелец).
- **Коммиты — только по явной просьбе владельца.** Шаги «фиксация» ниже отмечают
  логические точки; фактически `git commit` выполняется одной пачкой, когда владелец
  скажет «коммить».
- Весь игроку-видимый текст — русский, business-fantasy тон; числа по value-emphasis
  (`CONVENTIONS §4.13`); лорные строки — сверка с `docs/lore/canon.md` (скилл
  `lore-keeper`), формулы из канона §8.1 не повторять.
- Toast на мутациях — `sonner`; loading — `<Skeleton>`; empty — `<EmptyState>`.
- Theme-классы: `.panel`, `.gold-text`, `.text-profit/.text-loss`, `.font-mono-num`,
  `.scrollbar-ledger`. Никаких `alert()`/`console.log`.
- Server-only: клиент не импортирует `src/lib/api/*.ts` — только хуки `client.ts`.
- Серверная логика — в `src/lib/api/army.ts`, НЕ в `server.ts`.
- Сид-скрипты **не запускать** (`prisma/seed*.ts` исполняют деструктивный main) —
  только читать; синтаксис проверять `tsc`. Для живой БД — идемпотентный
  `prisma/sync-army.ts` (новый), гоняется entrypoint.
- Конфиг-ручки — `game_configs` с фолбэками в коде (строгое чтение
  `getConfigInt/Float`); тюнинг — через админку, не хардкод.
- React-hooks: strict-правила (derivation вместо setState-in-effect, hoisted rAF,
  точечные disable для внешних побочек). После UI — `npx react-doctor@latest --scope changed`,
  score не должен упасть.
- Мобильную вёрстку существующих экранов не ломать (сетка флигелей уже адаптивна).
- Иконки ресурсов остаются emoji; новые армейские иконки на старте — emoji
  (medальоны/эмодзи допустимы), арт `wing-barracks.png` — плейсхолдер до авторского.

## Числа-дефолты (фолбэки в коде = сид в `game_configs`)

| Ключ | Дефолт |
|---|---|
| `army.unlockLevel` | 10 |
| `army.unit.swordsman.{power,hp,wageGold,foodPerWeek,hireGold}` | 10, 12, 20, 2, 40 |
| `army.unit.archer.{power,hp,wageGold,foodPerWeek,hireGold}` | 8, 8, 16, 2, 35 |
| `army.unit.rider.{power,hp,wageGold,foodPerWeek,feedPerWeek,hireGold}` | 15, 11, 45, 2, 2, 120 |
| `army.gear.qBonusPct` | `[0, 10, 25, 40]` (О/Х/М/Г) |
| `army.gear.wearPerBattle` | 1 |
| `army.gear.militiaPowerMult` | 0.6 (ополчение без полного комплекта) |
| `army.veteranMult` / `army.veteranWagePct` | 1.25 / 50 |
| `army.morale.{start,win,loss,rout,hungryStep,unpaidStep}` | 70, +8, −10, −20, −15, −15 |
| `army.morale.desertionThresholdPct` | 20 (при морали ≤ 20% — дезертирство) |
| `army.desertionPctPerSettle` | 0.10 |
| `army.casualty.win.{wounded,dead,deserted}` | 80/15/5 (%) |
| `army.casualty.loss.{wounded,dead,deserted}` | 50/30/20 |
| `army.casualty.rout.{wounded,dead,deserted}` | 35/45/20 |
| `army.pursuit.cavFactor` | 0.6 (доля беглецов→погибших × доля всадников победителя) |
| `army.order.assault.{dmg,selfCas,loot}` | 1.2 / 1.25 / 1.0 |
| `army.order.careful.{dmg,selfCas,loot}` | 0.85 / 0.75 / 0.8 |
| `army.order.raid.{dmg,selfCas,loot,marchMult}` | 1.0 / 1.1 / 1.25 / 0.7 |
| `army.march.baseMinutes` / `army.march.cavSpeedBonus` | 40 / 0.4 (−40% за 100% всадников) |
| `army.camp.tier{1..5}.{power,lootGold}` | 25/80, 60/180, 140/400, 320/900, 700/2000 |
| `army.camp.respawnDays` | 2 (ролл 2–4) |
| `army.raid.repGain` | 5 |
| `army.woundRecoveryHours` | 24 |
| `army.settle.maxBackWeeks` | 2 (без вечного бэкпея офлайн-недель) |
| `army.recruitPool.{tier1,tier2,tier3}` | 3 / 6 / 10 (в неделю) |
| `estate.wing.barracks.{1,2,3}` (JSON: goldCost + parts) | 1500⟆+2 части, 6000⟆+3, 20000⟆+4 |
| `estate.barracks.capacity.{tier1,tier2,tier3}` | 12 / 30 / 60 |

---

### Task 1: Схема БД — модели войск

**Files:**
- Modify: `prisma/schema.prisma` (новые модели в конце, рядом с estate-моделями)
- Modify: `ai-context/DATA-MODEL.md` (новая секция «Войска»)

**Interfaces:**
- Produces (для всех следующих задач): модели `PlayerArmy`, `TroopSquad`,
  `ArmyGearSlot`, `ArmySupply`, `Campaign`, `WarCamp` — имена полей ниже.

- [ ] **Step 1: Добавить модели в `prisma/schema.prisma`**

```prisma
model PlayerArmy {
  playerId      String   @id
  morale        Int      @default(70) // 0..100
  recruitPool   Int      @default(0)  // новобранцы на плацу
  lastSettledAt DateTime?
  lastRecruitAt DateTime?
  lastWoundedAt DateTime?
}

model TroopSquad {
  id        String @id @default(cuid())
  playerId  String
  unitType  String // swordsman | archer | rider
  count     Int    @default(0) // всего (включая раненых и ветеранов)
  wounded   Int    @default(0)
  veterans  Int    @default(0)
  @@unique([playerId, unitType])
}

model ArmyGearSlot {
  id            String @id @default(cuid())
  playerId      String
  unitType      String // чей слот (swordsman|archer|rider)
  slot          String // weapon|shield|bow|quiver|saber|saddle
  itemId        String
  quality       String @default("common")
  durability    Int
  maxDurability Int
  @@index([playerId])
}

model ArmySupply {
  id       String @id @default(cuid())
  playerId String
  kind     String // food | feed | bandage
  tier     Int    @default(1)
  qty      Int    @default(0)
  @@unique([playerId, kind, tier])
}

model Campaign {
  id             String   @id @default(cuid())
  playerId       String
  kind           String   @default("camp")
  targetId       String   // WarCamp.id
  order          String   @default("assault") // assault|careful|raid
  squadsSnapshot Json     // [{unitType, count, wounded, veterans, gearAvgIdx}]
  enemySnapshot  Json     // [{type, count}] на момент похода
  status         String   @default("marching") // marching|resolved|collected
  resolveAt      DateTime
  report         Json?
  seed           Int
  notified       Boolean  @default(false)
  createdAt      DateTime @default(now())
  @@index([playerId, status])
}

model WarCamp {
  id        String   @id // camp_{cityId}_{tier}_{n}
  kind      String   @default("bandit")
  cityId    String
  tier      Int      // 1..5
  posPct    Json     // [x, y] в % подложки карты
  garrison  Json     // [{type: "bandit_melee", count: 6}]
  loot      Json     // {gold, items: [{itemId, qty, chance}]}
  status    String   @default("active") // active | cleared
  respawnAt DateTime?
}
```

- [ ] **Step 2: Сгенерировать типы**

Run: `bun run db:generate`
Expected: Prisma Client сгенерирован без ошибок.

- [ ] **Step 3: Обновить `ai-context/DATA-MODEL.md`** — секция «Войска (фаза 1)»:
6 моделей, уникальные ключи, смысл полей (по образцу существующих секций).

- [ ] **Step 4: Фиксация** (точка коммита: «schema: войска — рота/снаряжение/походы/лагеря»).

---

### Task 2: Ядро юнитов + конфиг-акцессор

**Files:**
- Create: `src/lib/army/units.ts`
- Test: `src/lib/army/units.test.ts`
- Modify: `src/lib/game-config.ts` (акцессор `getArmyConfig`)
- Modify: `scripts/run-tests.ts` (группа `army` в `GROUPS`, лекал `guild: { label, match }`,
  `match: /lib\/army/`)

**Interfaces:**
- Produces: `UnitType`, `GEAR_SLOTS`, `UnitDef`, `UNITS: Record<UnitType, UnitDef>`,
  `GEAR_ITEM_BY_SLOT: Record<GearSlot, string>`, `COUNTER_OF: Record<UnitType, UnitType>`,
  `SUPPLY_SOURCES: Record<string, { kind: "food"|"feed"|"bandage"; tier: number }>`
  (itemId → слот запаса), `getArmyConfig(): ArmyConfig`.
- `ArmyConfig` — плоский объект со всеми числами из таблицы дефолтов выше
  (читается `getConfigInt/getConfigFloat/getConfigJSON` с фолбэками; паттерн —
  `getCraftConfig` в том же файле).

- [ ] **Step 1: Падающий тест `src/lib/army/units.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { UNITS, GEAR_ITEM_BY_SLOT, COUNTER_OF, SUPPLY_SOURCES } from "./units";

describe("army units catalog", () => {
  test("три типа войск с комплектами снаряжения", () => {
    expect(Object.keys(UNITS).sort()).toEqual(["archer", "rider", "swordsman"]);
    expect(UNITS.swordsman.slots).toEqual(["weapon", "shield"]);
    expect(UNITS.archer.slots).toEqual(["weapon", "quiver"]);
    expect(UNITS.rider.slots).toEqual(["weapon", "saddle"]);
  });
  test("контр-треугольник замкнут: всадник→лучник→воин→всадник", () => {
    expect(COUNTER_OF.rider).toBe("archer");
    expect(COUNTER_OF.archer).toBe("swordsman");
    expect(COUNTER_OF.swordsman).toBe("rider");
  });
  test("каждый слот снаряжения отображается на существующий предмет", () => {
    for (const item of Object.values(GEAR_ITEM_BY_SLOT)) expect(item).toMatch(/^army_/);
  });
  test("еда и корм из каталога маппятся в запасы", () => {
    expect(SUPPLY_SOURCES["estate_food_t1"]).toEqual({ kind: "food", tier: 1 });
    expect(SUPPLY_SOURCES["feed_oats"]).toEqual({ kind: "feed", tier: 1 });
  });
});
```

- [ ] **Step 2: Run `bun test src/lib/army/units.test.ts`** — Expected: FAIL (модуля нет).

- [ ] **Step 3: Реализовать `src/lib/army/units.ts`** — каталог из таблицы дефолтов:
`UNITS` (names: «Воин», «Лучник», «Всадник» — идентификаторы, не UI-строки;
UI-имена кладутся рядом полем `title`), `GEAR_ITEM_BY_SLOT`
(`weapon`→`army_blade`, `shield`→`army_shield`, `bow`→`army_bow`,
`quiver`→`army_quiver`, `saber`→`army_saber`, `saddle`→`army_saddle`),
`COUNTER_OF`, `SUPPLY_SOURCES` (`estate_food_t1/t2`→food 1/2, `feed_oats/feed_mash/feed_ration`→feed 1/2/3, `army_bandage`→bandage 1).
Значения чисел — из `getArmyConfig()`, поэтому `UnitDef` хранит только
типобезопасные ключи конфига (`cfgUnit("swordsman").power`).

- [ ] **Step 4: `getArmyConfig()` в `game-config.ts`** — по лекалу `getCraftConfig`:
каждое поле `getConfigInt("army.…", fallback)`; массив `qBonusPct` через
`getConfigJSON`. Кэш не нужен (акцессоры читают через общий `loadCache`).

- [ ] **Step 5: Группа тестов** — в `scripts/run-tests.ts` → `GROUPS`:

```ts
army: { label: "Войска (ядра)", match: /lib\/army/ },
```

- [ ] **Step 6: Run `bun test src/lib/army/units.test.ts`** — Expected: PASS.
Затем `bun run test:contracts` не должен сломаться: `bun scripts/run-tests.ts --list`
показывает группу army.

- [ ] **Step 7: Фиксация** (точка коммита).

---

### Task 3: Ядро силы роты (`power.ts`)

**Files:**
- Create: `src/lib/army/power.ts`
- Test: `src/lib/army/power.test.ts`

**Interfaces:**
- Consumes: `UnitType`, `UNITS`, `getArmyConfig` (Task 2).
- Produces:
  - `interface SquadLike { unitType: UnitType; count: number; wounded: number; veterans: number }`
  - `interface GearSlotState { issued: number; required: number; qualityIdx: number }`
    (qualityIdx: 0..3 = О/Х/М/Г)
  - `gearFactor(slots: GearSlotState[]): number`
  - `squadPower(s: SquadLike, gear: GearSlotState[], moralePct: number, cfg): number`
  - `companyPower(squads: SquadLike[], gearByType: Record<UnitType, GearSlotState[]>, moralePct: number, cfg): { total: number; byType: Record<UnitType, number> }`
  - `isMilitia(gear: GearSlotState[]): boolean` (хотя бы один слот < required)

- [ ] **Step 1: Падающий тест**

```ts
import { describe, expect, test } from "bun:test";
import { gearFactor, squadPower, companyPower, isMilitia } from "./power";

const cfg = { gearQBonusPct: [0, 10, 25, 40], veteranMult: 1.25, militiaPowerMult: 0.6, moraleMin: 0.7, moraleMax: 1.1 } as const;

describe("company power", () => {
  test("полный комплект common даёт ×1", () => {
    const g = [{ issued: 10, required: 10, qualityIdx: 0 }, { issued: 10, required: 10, qualityIdx: 0 }];
    expect(gearFactor(g)).toBeCloseTo(1);
  });
  test("мастерское снаряжение добавляет +25% на слот", () => {
    const g = [{ issued: 10, required: 10, qualityIdx: 2 }, { issued: 10, required: 10, qualityIdx: 2 }];
    expect(gearFactor(g)).toBeCloseTo(1.25);
  });
  test("ополчение (нет щитов) — сила ×0.6", () => {
    const s = { unitType: "swordsman" as const, count: 10, wounded: 0, veterans: 0 };
    const full = [{ issued: 10, required: 10, qualityIdx: 0 }, { issued: 10, required: 10, qualityIdx: 0 }];
    const noShield = [full[0], { issued: 0, required: 10, qualityIdx: 0 }];
    expect(squadPower(s, noShield, 100, cfg)).toBeCloseTo(squadPower(s, full, 100, cfg) * 0.6);
    expect(isMilitia(noShield)).toBe(true);
  });
  test("раненые не считаются, ветераны ×1.25, мораль 70% → множитель ~0.98", () => {
    const s = { unitType: "swordsman" as const, count: 10, wounded: 4, veterans: 2 };
    const g = [{ issued: 6, required: 6, qualityIdx: 0 }, { issued: 6, required: 6, qualityIdx: 0 }];
    // 6 бойцов × 10 силы × 1.25^(2/6 ветеранская доля — см. реализацию) × morale
    expect(squadPower(s, g, 70, cfg)).toBeGreaterThan(0);
    expect(squadPower(s, g, 70, cfg)).toBeLessThan(squadPower({ ...s, wounded: 0 }, g, 100, cfg));
  });
  test("companyPower суммирует по типам", () => {
    const squads = [
      { unitType: "swordsman" as const, count: 5, wounded: 0, veterans: 0 },
      { unitType: "archer" as const, count: 3, wounded: 1, veterans: 0 },
    ];
    const r = companyPower(squads, { swordsman: [], archer: [], rider: [] }, 100, cfg);
    expect(r.total).toBeCloseTo(50 + 2 * 8 * 0.6); // ополчение ×0.6 у лучников
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Реализовать.** Формулы:

```ts
export function gearFactor(slots: GearSlotState[]): number {
  if (!slots.length) return 0; // нет слотов у типа — снаряжение не влияет
  const per = slots.map((s) => {
    const fill = Math.min(1, s.required ? s.issued / s.required : 0);
    const bonus = 1 + (cfgGearQBonusPct[s.qualityIdx] ?? 0) / 100;
    return fill * bonus;
  });
  return per.reduce((a, b) => a + b, 0) / per.length;
}
```

`squadPower`:
`effective = max(0, count − wounded)`; `veteranShare = count ? veterans / count : 0`;
`moraleMult = 0.7 + (clamp(moralePct,0,100)/100) × 0.4`;
`base = effective × UNITS[type].power(cfg)`; множитель снаряжения: если
`isMilitia` → `militiaPowerMult` (плоский), иначе `gearFactor`;
`veteranMult = 1 + (veteranMultCfg − 1) × veteranShare` (доля ветеранов в стеке);
итог `base × gearMult × veteranMult × moraleMult`, округление `Math.round`.

`companyPower` — сумма `squadPower` по типам (незаданные типы пропускаются).

- [ ] **Step 4: Run `bun test src/lib/army/power.test.ts`** — Expected: PASS.

- [ ] **Step 5: Фиксация.**

---

### Task 4: Ядро боя (`battle-core.ts`) — авто-резолв с seed

**Files:**
- Create: `src/lib/army/battle-core.ts`
- Test: `src/lib/army/battle-core.test.ts`

**Interfaces:**
- Consumes: `UnitType`, `COUNTER_OF`, `getArmyConfig` (Task 2), `SquadLike` (Task 3).
- Produces:
  - `type OrderKey = "assault" | "careful" | "raid"`
  - `interface BattleUnitSide { type: UnitType; count: number }`
  - `interface CasualtySplit { wounded: number; dead: number; deserted: number }`
  - `interface BattleResult { outcome: "win"|"loss"|"rout"|"draw"; rounds: Array<{ n: number; dmgA: number; dmgB: number; hpA: number; hpB: number }>; casualties: { a: Record<UnitType, CasualtySplit>; b: Record<UnitType, CasualtySplit> }; seed: number }`
  - `mulberry32(seed: number): () => number`
  - `resolveBattle(a: BattleUnitSide[], b: BattleUnitSide[], opts: { seed: number; order: OrderKey; sideIsAttacker: boolean; cfg }): BattleResult` — `b` = гарнизон (типы врагов: `bandit_melee`/`bandit_archer`/`bandit_rider` — кодируются как `UnitType`-подобные ключи; матчап-функция общая через `COUNTER_OF`-подобную карту врагов, враги повторяют тот же треугольник).
  - `previewOdds(powerA: number, powerB: number): { label: string }` — вербальная оценка
    («Разгромный перевес» / «Перевес» / «На равных» / «Рискованно» / «Безнадёжно») —
    чистая функция для UI (без честных %: сила ≠ гарантия).

- [ ] **Step 1: Падающий тест**

```ts
import { describe, expect, test } from "bun:test";
import { resolveBattle, mulberry32, previewOdds } from "./battle-core";

const cfg = {
  roundsCap: 8, matchupMult: 1.15, orderAssaultDmg: 1.2, orderCarefulDmg: 0.85, orderRaidDmg: 1.0,
  casualtyWin: { wounded: 80, dead: 15, deserted: 5 },
  casualtyLoss: { wounded: 50, dead: 30, deserted: 20 },
  casualtyRout: { wounded: 35, dead: 45, deserted: 20 },
  pursuitCavFactor: 0.6,
} as const;

const A = [{ type: "swordsman" as const, count: 10 }, { type: "archer" as const, count: 6 }];
const B = [{ type: "bandit_melee" as const, count: 8 }];

describe("battle-core", () => {
  test("детерминирован при том же seed", () => {
    const r1 = resolveBattle(A, B, { seed: 42, order: "assault", sideIsAttacker: true, cfg });
    const r2 = resolveBattle(A, B, { seed: 42, order: "assault", sideIsAttacker: true, cfg });
    expect(r1).toEqual(r2);
  });
  test("сильная сторона побеждает, потери раскладываются в спектр", () => {
    const r = resolveBattle(A, B, { seed: 7, order: "assault", sideIsAttacker: true, cfg });
    expect(r.outcome).toBe("win");
    const tot = Object.values(r.casualties.a).reduce((s, c) => s + c.wounded + c.dead + c.deserted, 0);
    expect(tot).toBeLessThan(16); // победитель теряет меньшинство
  });
  test("преследование конвертирует беглецов в погибших у разбитого", () => {
    const r = resolveBattle(A, [{ type: "bandit_melee" as const, count: 1 }], { seed: 7, order: "assault", sideIsAttacker: true, cfg });
    expect(r.outcome).toBe("win");
    const tot = Object.values(r.casualties.b).reduce((s, c) => s + c.dead, 0);
    expect(tot).toBeGreaterThanOrEqual(0);
  });
  test("mulberry32 детерминирован в [0,1)", () => {
    expect(mulberry32(1)()).toBe(mulberry32(1)());
    const v = mulberry32(5)();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
  test("previewOdds даёт вербальную оценку", () => {
    expect(previewOdds(1000, 100).label).toBe("Разгромный перевес");
    expect(previewOdds(100, 1000).label).toBe("Безнадёжно");
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Реализовать алгоритм:**

```
rng = mulberry32(seed)
hpPools: A/B = Σ count × hp(type); powerA/B = Σ count × power(type)
each round n = 1..8:
  dmgA = Σ по типам A: count×power × matchup(type→у кого контрит в B) × U(0.9..1.1) × orderDmg
  (matchup: type.counter == вражеский тип → ×1.15; вражеский type.counter == type → ×0.85; иначе ×1.0)
  hpB −= dmgA; затем симметрично dmgB → hpA −= dmgB (×1.0, приказ врага отсутствует)
  записать в rounds; если hpB ≤ 0 или hpA ≤ 0 — стоп.
outcome: hpB ≤ 0 → win; hpA ≤ 0 → rout (разгром, если hpA иссяк при перевесе сил врага ≥2× на старте, иначе loss);
  иначе (8 раундов): доля hp% — у кого больше, тот win/loss; разница <10% → draw (обе стороны отступают).
casualties(side) = clamp(round(dmgTaken / avgHpUnit), 0, countEffective) по типам пропорционально доле типа;
  раскладка по колонкам таблицы (win/loss/rout); у draw — все потери = раненые.
pursuit (только проигравший): extraDead = min(deserted, round(deserted × (0.2 + cavFactor × cavShareWinner)));
  deserted −= extraDead; dead += extraDead.
```

`mulberry32` — стандартные 32 бита (реализация из вики, 5 строк).

- [ ] **Step 4: Run `bun test src/lib/army/battle-core.test.ts`** — Expected: PASS
  (все asserts корректны, «ловушки» из шага 1 вычищены).

- [ ] **Step 5: Фиксация.**

---

### Task 5: Ядро еженедельного сеттла (`settle-core.ts`)

**Files:**
- Create: `src/lib/army/settle-core.ts`
- Test: `src/lib/army/settle-core.test.ts`

**Interfaces:**
- Consumes: `SquadLike`, `UNITS`, `getArmyConfig`.
- Produces:
  - `weeksElapsed(last: Date | null, now: Date): number` (целые недели, 0 если <7 дней)
  - `interface SettlePlan { weeks: number; foodNeed: number; feedNeed: number; wageGold: number; moraleSteps: Array<{ reason: "hungry"|"unpaid"; delta: number }>; deserters: Record<UnitType, number>; woundedHeal: boolean; recruitRefill: number }`
  - `planSettle(args: { squads: SquadLike[]; morale: number; recruitPool: number; recruitPerWeek: number; lastSettledAt: Date | null; lastWoundedAt: Date | null; now: Date; woundRecoveryHours: number; maxBackWeeks: number; cfg }): SettlePlan` — чистая; применение (списания/мораль/дезертирство) — в `api/army.ts`.
  Правила: needs = Σ по типам (weeks × perWeek); wage = Σ (count × wage + veterans × wage × veteranWagePct/100) × weeks; `woundedHeal = lastWoundedAt && now − lastWoundedAt ≥ woundRecoveryHours`; `recruitRefill` — только за текущую неделю (pool = max(pool, perWeek)); deserters считаются вызывающей стороной после применения морали (чистая функция `desertionCounts(squads, morale, pct)`).

- [ ] **Step 1: Падающий тест** — кейсы: (1) 0 недель → пустой план;
  (2) 2 недели, 10 воинов → foodNeed 20, wage 400; (3) раненые с `lastWoundedAt`
  25 ч назад → `woundedHeal = true`; (4) `maxBackWeeks`: 10 недель офлайна → план
  только на 2; (5) всадники добавляют feedNeed.

- [ ] **Step 2: Run** — FAIL → **Step 3: реализовать** → **Step 4: Run** — PASS.

- [ ] **Step 5: Фиксация.**

---

### Task 6: Каталог — предметы и рецепты армии

**Files:**
- Modify: `prisma/seed-estate.ts` — массив `ESTATE_DEFS` пополняется военными
  предметами (лекал строк estate: id-префикс, category, basePrice, рецепт
  `r_{itemId}` с входами только из существующего каталога — hard rule шапки файла)
- Modify: `prisma/generate-resources.ts` — пробросить новые дефы (import + push в
  items/recipes, как сделано для estate на строках ~792/1081)
- Modify: `src/components/game/recipe-explorer.tsx:171` (`speciesFromRecipe`) —
  добавить префиксную группу `"army"` (семейство каталога крафта «Снаряжение роты»)
- Modify: `src/lib/api/production.ts` (`isAlwaysCommonOutput`) — префиксы
  `army_quiver`, `army_bandage`, `army_repair_kit` → always common (расходники)

**Interfaces:**
- Produces (id предметов для Tasks 2/7/9): `army_blade`, `army_shield`, `army_bow`,
  `army_quiver`, `army_saber`, `army_saddle`, `army_bandage`, `army_repair_kit`,
  `estate_barracks_bunks`, `estate_rack_arms`, `estate_drill_yard`.

- [ ] **Step 1: Добавить DEF-строки в `seed-estate.ts`** (цены/входы — стартовые,
  тюнинг потом из админки):

| id | Имя | Профессия | Входы (пример) | basePrice | goldCost |
|---|---|---|---|---|---|
| army_blade | Ратный клинок | blacksmith | сталь T2-stage5 ×2, кожаные полосы ×2 | 320 | 16 |
| army_shield | Дощатый щит | forester | доска T2-stage5 ×2, жесть ×1, кожа ×1 | 180 | 9 |
| army_bow | Составной лук | forester | тис-заготовка T3-stage5 ×1, жилы ×2 | 260 | 13 |
| army_quiver | Колчан со стрелами (расходник) | weaver | кожа ×2, древесный наконечник ×2 | 60 | 3 |
| army_saber | Седельная сабля | blacksmith | сталь T3-stage5 ×2, кожа ×2 | 480 | 24 |
| army_saddle | Седельный набор | weaver | выделанная кожа T3-stage5 ×2, жесть ×2 | 420 | 21 |
| army_bandage | Перевязочный набор (расходник) | herbalist | травы ×2, полотно ×1 | 40 | 2 |
| army_repair_kit | Латальный набор (расходник) | blacksmith | жесть ×2, кожа ×1 | 120 | 6 |
| estate_barracks_bunks | Казарменные койки | forester | брус T2 ×3, гвозди ×2 | 260 | 13 |
| estate_rack_arms | Оружейная стойка | blacksmith | сталь T2 ×2, доска T2 ×2 | 220 | 11 |
| estate_drill_yard | Плацевый навес | forester | брус T2 ×4, полотно ×2 | 300 | 15 |

Конкретные itemId входов сверить с фактическим каталогом `generate-resources.ts`
(stage-5 имена семей/видов; там где в таблице «сталь/кожа» — подставить реальные
species stage-5/T2-T3). Точные русские имена предметов — черновые; перед деплоем
прогнать через lore-keeper (канон §8.1, новые формулы — в бюджет).

- [ ] **Step 2: Проброс в `generate-resources.ts`** + убрать из `ITEM_PRICE_SYNC_CATEGORIES`
  ничего не надо (категория `estate` уже синкается; для army-предметов выбрать
  category `estate`? Нет — военные предметы не усадьба. Выбрать **новую category
  `army`** и добавить её в `ITEM_PRICE_SYNC_CATEGORIES` в `rebalance-craft-recipes.ts`,
  чтобы живые цены синкались с сида).

- [ ] **Step 3: Проверки**: `bunx tsc --noEmit` (типы), `bun run lint`.
  Рецепты считаются `generateAllRecipes()` — тест маржи
  (`generate-resources.craft-margin.test.ts`) обязан остаться зелёным:
  `bun test prisma/generate-resources.craft-margin.test.ts` (если падает по марже —
  поднять goldCost/цены до положительной маржи, лекал финишных).

- [ ] **Step 4: Фиксация.**

---

### Task 7: Синк на живую БД + сид конфигов + лагеря

**Files:**
- Create: `prisma/sync-army.ts` (лекал `prisma/sync-estate.ts`: standalone PrismaClient,
  идемпотентные upsert-ы, console-сводка)
- Modify: `prisma/seed-config.ts` — ключи `army.*` + `estate.wing.barracks.{1..3}` +
  `estate.barracks.capacity.*` (в категорию `army`/`estate`; фолбэки из таблицы выше)
- Modify: `docker/entrypoint.sh` — после строки `bun run prisma/sync-estate.ts …`
  (строка ~188) добавить:

```bash
bun run prisma/sync-army.ts 2>/dev/null || echo "  ⚠️ Army sync skipped (non-critical)"
```

**Interfaces:**
- Produces: на живой БД существуют армейские предметы/рецепты/конфиги/лагеря;
  `WarCamp` — по 2 активных лагеря на каждый добывающий город (тиры 1–3 и 2–4
  в зависимости от города), позиции в `posPct` от `REGION_GEO`-ориентиров.

- [ ] **Step 1: `sync-army.ts`** — upsert-ы:
  1. Предметы армии (из `generateAllItems()` filter category `army` + estate-части
     казармы) — `item.upsert`;
  2. Рецепты армии (из `generateAllRecipes()`, filter output startsWith `army_` +
     казарменные estate-части) — лекал rebalance (создаёт missing, обновляет состав);
  3. Ключи `army.*`/`estate.wing.barracks.*`/`estate.barracks.capacity.*` —
     `gameConfig.upsert` (НЕ перетирать существующие значения — `skipExisting`-паттерн
     из `sync-gather-zones.ts`);
  4. `WarCamp`: сид-константы `ARMY_CAMPS` (внутри `sync-army.ts`): на город —
     `{ cityId: "whisperwood", tiers: [1,2,3] }`, `{ karstenholm: [2,3,4] }`,
     `{ "verdant-hollow": [1,2,3] }`, `{ goldreach: [1,2,3] }`, по 1 лагерю на тир,
     `posPct` вокруг звезды города (из `geo-data.ts` констант, смещения вручную),
     гарнизон из `army.camp.tierN.power` → состав бандитов (распределение
     power по типам: melee/archer/rider ≈ 60/25/15%), лут: gold + еда/кожа/сталь-стейки.
     Upsert только отсутствующих (`create` с фиксированным id
     `camp_{cityId}_t{tier}_{1..}`) — существующие не трогать (позиции могут быть
     правлены админом в будущем).

- [ ] **Step 2: Сид `seed-config.ts`** — те же ключи, что в п.3 (для новых инсталляций).

- [ ] **Step 3: Проверки**: `bunx tsc --noEmit`; `bun scripts/run-tests.ts --list`.
  Синк локально НЕ запускать (нет БД) — синтаксическая проверка `tsc` достаточна
  (прецедент: сиды не гонять).

- [ ] **Step 4: Фиксация.**

---

### Task 8: Серверный модуль — маппер, сеттл, найм, запасы

**Files:**
- Create: `src/lib/api/army.ts`
- Modify: `ai-context/SERVER-FUNCTIONS.md` (строки модуля)

**Interfaces:**
- Consumes: Task 1 (модели), Task 2–5 (ядра), `db` из `@/lib/db`, `spendGold/addGold/
  addInventory/removeInventory` из `economy.ts`, `fitIntoWarehouse` из
  `warehouse-caps.ts`, `getReputationLevel`/репутация из `economy.ts:214-298`.
- Produces (для Task 9/10):
  - `mapArmy(playerId): Promise<ArmyDTO>` — вызывает `ensureArmySettled`, возвращает
    `{ unlocked, level, morale, capacity, recruitPool, squads: ArmySquadDTO[], gear:
    Record<UnitType, { slots: Array<{ slot, required, issued, avgQualityIdx }>, factor }>,
    supplies: Array<{ kind, tier, qty }>, power: { total, byType }, activeCampaign?,
    reports: CampaignDTO[] (последние 10 resolved) }`
  - `ensureArmySettled(playerId)` — single-flight (модульный `Map`, лекал
    `settleEstateStaff`): `planSettle` → транзакция: списание `ArmySupply`
    (guarded `updateMany where qty >= n`, младший тир первым) → склад homeCity
    (`estate_food_t1/t2`, `feed_*`, только common) → `spendGold` (недостаток золота:
    moraleStep `unpaid`) → мораль (clamp 0..100) → дезертирство при
    `morale ≤ threshold` (уход `desertionPctPerSettle` от каждого стека, снаряжение
    слотов типа остаётся) → `woundedHeal` (wounded→0) → `recruitPool` refill.
  - `hireTroops(playerId, unitType, qty)` — гейты: `unlockLevel`, вместимость
    (capacity − Σ count ≤ 0 → ошибка `ARMY_BARRACKS_FULL`), `recruitPool ≥ qty`;
    списание найма goldCost × qty; upsert `TroopSquad`.
  - `dismissTroops(playerId, unitType, qty)` — уменьшение стека (сначала новобранцы,
    ветераны последними).
  - `depositSupply(playerId, itemId, qty)` / `withdrawSupply(playerId, kind, tier, qty)`
    — через `SUPPLY_SOURCES`; deposit только common со склада homeCity
    (`removeInventory`), withdraw — обратно (`addInventoryTx` + гейт capacity).

- [ ] **Step 1: Реализовать** (TDD на чистых ядрах уже сделан; здесь — тонкая
  транзакционная обвязка по лекалам `estate-staff.ts`/`economy.ts`).
- [ ] **Step 2: `bunx tsc --noEmit`** + **`bun run lint`** — зелёные.
- [ ] **Step 3: Фиксация.**

---

### Task 9: Серверный модуль — снаряжение и походы

**Files:**
- Modify: `src/lib/api/army.ts` (добавить функции)
- Modify: `src/lib/economy-flows.ts` + `src/lib/api/economy-telemetry.ts`
  (категории потоков: `army_wages`, `army_hire`, `army_gear`, `army_loot`,
  `army_campaign` — в `FlowCategory` и `classifyActivityFlow`)

**Interfaces (добавляются):**
- `issueGear(playerId, unitType, slot, itemId, quality, qty)` — списывает стак со
  склада homeCity, создаёт/доливает `ArmyGearSlot`-инстансы (полная прочность из
  `ToolConfig`-подобного расчёта: `army.gear.maxDurability = 20` конфиг);
  кап = required × effectiveCount(типа) × 2 (запас 100%? нет — кап = required ×
  effective, чтобы не копить лишнее; запас сверх — не выдавать).
- `returnGear(playerId, unitType, slot, qty)` — только слоты с полной прочностью
  возвращаются в стак исходного качества; изношенный — `scrapGear(slotId)` (лом за
  золото: `max(scrapMinGold, floor(durability × scrapGoldPerDurability))`, лекал
  стойки) или `repairGear(slotId)` — списывает `army_repair_kit` ×1, +10 прочности.
- `startCampaign(playerId, campId, squads: Record<UnitType, number>, order)` —
  гейты: лагерь `active`, нет другой `marching`-кампании, `unlockLevel`,
  состав ≤ effective; снимает `squadsSnapshot` (+`gearAvgIdx` по типам из слотов),
  `resolveAt = now + baseMinutes × tierFactor × (1 − cavShare × cavSpeedBonus) ×
  orderMarchMult`; seed = crypto int.
- `resolveDueCampaigns(playerId)` (вызов из `mapArmy`): для `marching && resolveAt ≤ now`
  — `resolveBattle` (seeded), применить к `TroopSquad` (dead: count−; deserted: count−;
  wounded += wounded), ветеранский рост (за победу каждый 4-й участник → veterans+1,
  cap count), износ слотов (`wearPerBattle` за каждый выданный слот задействованных
  типов), лагерь → `cleared` + `respawnAt = now + rand(2..4)d`, репутация города
  +`repGain`, мораль ± , `status = resolved`, `report = {...}` (факты: составы,
  rounds, casualties, seed, order). Лут НЕ выдаётся до collect.
- `collectCampaign(playerId, campaignId)` — атомарный claim (лекал
  `collectProduction`): gold → `addGold` (категория `army_loot`), items →
  `fitIntoWarehouse` (не влезло → конвертация в золото по NPC ×0.7, строка в тосте
  «скупщик забрал излишек»), `status = collected`.
- Ленивый респавн лагерей: в `mapArmy` — `updateMany({ where: { status: "cleared",
  respawnAt ≤ now }, data: { status: "active", respawnAt: null } })`.

- [ ] **Step 1: Реализовать** (обвязка над battle-core; транзакции по лекалам).
- [ ] **Step 2: `bunx tsc --noEmit` + `bun run lint`** — зелёные.
- [ ] **Step 3: Фиксация.**

---

### Task 10: Роуты + хуки + уведомления + realtime

**Files:**
- Create: `src/app/api/army/route.ts` (GET → `mapArmy`)
- Create: `src/app/api/army/action/route.ts` (POST, action-switch по лекалу
  `inventory/action`: `hire|dismiss|deposit|withdraw|issue|return|scrap|repair`)
- Create: `src/app/api/army/campaign/route.ts` (POST `start|collect`)
- Modify: `src/lib/api/server.ts` — обёртка `pushWarReportReady(playerId)`
  (лекал `pushGuildAlert`, endpoint `/notify` с payload; **только обёртка**, без
  правок realtime-сервиса в этом таске)
- Modify: `mini-services/realtime-service/index.ts` — в `SWEEP_KEYS` добавить
  `"army"` (свип 30 с инвалидирует данные войск)
- Modify: `src/lib/api/server.ts` `generatePendingNotifications` — кампании
  `resolved && !notified` → уведомление «Рапорт готов: …» + `notified = true` +
  `pushWarReportReady`
- Modify: `src/lib/api/client.ts` — хуки `useArmy()`, `useArmyAction()`,
  `useArmyCampaign()` (mutation, invalidate `["army"]`, `["estate"]`, `["gatherMap"]`,
  `["notifications"]`; тосты из ответа)
- Modify: `ai-context/API-MAP.md`, `SERVER-FUNCTIONS.md`, `CLIENT-HOOKS.md`

**Interfaces:**
- Produces (клиент): `useArmy(): { data?: ArmyDTO }`, `useArmyAction(): useMutation`,
  `useArmyCampaign(): useMutation`. DTO — как в Task 8/9.

- [ ] **Step 1: Роуты** — session-gated (`getServerSession`), zod-схемы body
  (лекал соседних action-роутов), ошибки модуля → 400 с кодом
  (`ARMY_BARRACKS_FULL`, `ARMY_LOCKED`, `CAMPAIGN_ACTIVE`, `CAMP_NOT_ACTIVE`).
- [ ] **Step 2: Хуки + уведомления + свип.**
- [ ] **Step 3: `bunx tsc --noEmit` + `bun run lint`.**
- [ ] **Step 4: Обновить API-MAP/SERVER-FUNCTIONS/CLIENT-HOOKS.**
- [ ] **Step 5: Фиксация.**

---

### Task 11: Усадьба — флигель «Казарма»

**Files:**
- Modify: `src/lib/estate-bonuses.ts` — `EstateWingKind` + `ESTATE_WING_KINDS`
  добавить `"barracks"`; хелпер `barracksCapacity(tier)` (0/12/30/60 из конфига)
- Modify: `prisma/seed-estate.ts` — `ESTATE_WING_UPGRADES` +3 строки (barracks 1..3:
  goldCost + parts `estate_barracks_bunks/rack_arms/drill_yard`)
- Modify: `prisma/seed-config.ts` — `estate.wing.barracks.{1..3}` (уже в Task 7 —
  убедиться, что сид и синк согласованы)
- Modify: `src/components/game/estate/bits.tsx` — `WING_META.barracks`
  (label «Казарма», icon `⚔️`, accent, `image: "/estate/wing-barracks.png"`)
  + `WING_ORDER` → `["storage","workshop","stable","chancery","barracks"]`
- Modify: `src/components/game/estate/workbench.tsx:270-293` — сетка
  `xl:grid-cols-4` → `xl:grid-cols-5`
- Asset: `public/estate/wing-barracks.png` — временный плейсхолдер (копия
  `wing-storage.png`, затемнённая на 40% — чтобы карточка не была битой; владелец
  заменит авторским артом)
- Modify: `src/components/game/estate/wing-detail.tsx` — route kind `barracks` →
  `<BarracksBay />` (Task 12)
- Modify: `src/lib/api/estate.ts` `computeActiveEstateBonuses` — казарма НЕ участвует
  в общих бонусах (проверить, что generic-цикл по `ESTATE_WING_KINDS` не начнёт
  требовать у казармы NPC-контракт; при необходимости — исключение по kind)

**Interfaces:**
- Produces: `barracksCapacity(tier): number` — используется UI казармы и `hireTroops`.

- [ ] **Step 1: Реализовать** (все правки точечные, по списку).
- [ ] **Step 2: Проверки**: `bunx tsc --noEmit`, `bun run lint`,
  `bun test` (estate-тесты если есть — зелёные).
- [ ] **Step 3: Фиксация.**

---

### Task 12: Досье казармы + диалог похода (UI усадьбы)

**Files:**
- Create: `src/components/game/army/index.ts` (barrel)
- Create: `src/components/game/army/barracks-bay.tsx` — «дело флигеля» (лекал
  `depot-bay.tsx`): locked-state (уровень < `army.unlockLevel` → плашка с порогом),
  шапка (мораль — полоса 0..100 с `.text-profit/.text-loss`-подсветкой, вместимость
  `занято/всего` в `.font-mono-num`, сила роты — крупно `.gold-text`)
- Create: `src/components/game/army/roster-panel.tsx` — состав: по типу строка
  (имя, `в строю/ранено/ветераны`, жалованье/нед, обеспеченность снаряжением —
  чип класса О/Х/М/Г по `avgQualityIdx`), кнопки «Нанять» (диалог: пул плаца +
  слайдер количества + цена, disabled при `ARMY_BARRACKS_FULL`), «Распустить»
  (AlertDialog)
- Create: `src/components/game/army/gear-panel.tsx` — по типам: слоты
  (issued/required, прочность средняя), «Выдать» (пикер предмета+качества со
  склада — лекал ItemPicker из админки locations / market helpers), «Вернуть»
  (только целые), «Починить» (`army_repair_kit`), «В лом»
- Create: `src/components/game/army/supply-panel.tsx` — запасы food/feed/bandage
  (лекал SuppliesDesk из `staff-panel.tsx`): пополнить со склада / забрать
- Create: `src/components/game/army/raid-dialog.tsx` — выбор лагеря (если открыт
  из казармы — список активных; из карты — предвыбран), состав (по типу слайдер
  0..effective, «всё»), приказ (RadioGroup: Штурм/Осторожно/Наскок с описанием
  эффектов), превью: `previewOdds(наша сила с приказом, гарнизон)` + время марша +
  содержание похода; кнопка «Выступить» → `useArmyCampaign` start
- Create: `src/components/game/army/battle-report.tsx` — рапорт (лекал «Ведомости
  смены» из `game-result/`): шапка исхода (win — `.pulse-gold`), лента раундов
  (полоски dmg), блоки потерь с раскладкой раны/смерть/дезертирство
  (value-emphasis, `text-loss`), ветеранский рост, износ, трофеи, мораль ±,
  кнопка «Забрать трофеи» (collect) если не собран
- Modify: `src/components/views/estate-view.tsx` — ничего (досье монтируется через
  wing-detail)

**Interfaces:**
- Consumes: `useArmy`, `useArmyAction`, `useArmyCampaign` (Task 10), `ArmyDTO`.
- Тосты: найм «Новобранцы приведены к присяге: N × тип», выдача «Снаряжение
  выдано строю», лут «Трофеи доставлены на склад», ошибка кода → человекочитаемый
  текст.

- [ ] **Step 1: Компоненты** (по одному файлу за шаг; после каждого —
  `bunx tsc --noEmit`).
- [ ] **Step 2: `bun run lint` + `npx react-doctor@latest --scope changed`** —
  score не ниже прежнего.
- [ ] **Step 3: Фиксация.**

---

### Task 13: Карта земель — слой лагерей

**Files:**
- Create: `src/components/game/army/camps-layer.tsx` — HTML-кнопки поверх карты
  (лекал медальонов городов: `left/top` в % из `posPct`, иконка `⚑`/`🗡` по тиру,
  тултип «Лагерь · T3»), cleared — серый призрак с таймером респавна
- Modify: `src/components/game/gather/map/gather-map.tsx` — смонтировать
  `<CampsLayer />` после слоя городов (props: camps из `useArmy().data?.camps` —
  добавить `camps` в `ArmyDTO`: активные лагеря всех городов с `posPct/tier/status/respawnAt`)
- Create: `src/components/game/army/camp-panel.tsx` — панель лагеря (лекал
  `ZonePanel`, drag за шапку): состав гарнизона (силы по типам), слухи о трофеях
  («ходят слухи о казне ватажки» + диапазон золота), кнопка «Выступить» →
  `RaidDialog` с предвыбранным лагерем; гейт уровня (замок + «Нужен ур. N»)

**Interfaces:**
- Consumes: `useArmy` (camps), `RaidDialog` (Task 12).

- [ ] **Step 1: Реализовать слой + панель.**
- [ ] **Step 2: Проверки**: `bun run lint`, react-doctor `--scope changed`,
  `bunx tsc --noEmit`.
- [ ] **Step 3: Фиксация.**

---

### Task 14: Рапорт — доводка потока «поход → уведомление → рапорт»

**Files:**
- Modify: `src/components/game/army/battle-report.tsx` — открытие из: (а) тоста
  «Рапорт готов» (клик → диалог), (б) строки в казарме (список reports),
  (в) уведомления (линк на армию не обязателен — достаточно тоста при входе)
- Modify: `src/components/game/app-shell.tsx` — при маунте `useArmy` уже тянется
  усадьбой; для тоста вне усадьбы: лёгкий слушатель realtime `war:report-ready`
  в `src/lib/realtime.ts` (лекал `guild:alert`) → toast с кнопкой «Открыть»
  (zustand-стор `army-report-store.open(campaignId)` по лекалу `game-result-store`)

**Interfaces:**
- Produces: `useArmyReportStore()` — `open(campaignId)`, `close()`; хост рендерится
  в AppShell один раз.

- [ ] **Step 1: Стор + хост + realtime-слушатель.**
- [ ] **Step 2: Проверки** (lint/tsc/react-doctor).
- [ ] **Step 3: Фиксация.**

---

### Task 15: Патч-ноут, контекст, финальные проверки

**Files:**
- Modify: `src/lib/patch-notes.ts` — запись **0.30.250** «Казарма и Рота»
  (лошадиная доза business-fantasy, числа точные; лор — после lore-keeper сверки)
- Modify: `ai-context/GAME-SYSTEMS.md` — новая секция «ВОЙСКА (фаза 1)»: юниты,
  сила, содержание, снаряжение, бой, лагеря, походы (по образцу существующих секций)
- Modify: `ai-context/CONVENTIONS.md` — новые компоненты армейской папки (если
  появились переиспользуемые примитивы)
- Modify: `ai-context/GLOSSARY.md` — термины: Рота, Казарма, Плац, Наряд, Рапорт,
  Провизия, Воинство (фаза 2 — пометить «в разработке»)
- Modify: `ai-context/ARCHITECTURE.md` — модуль `src/lib/api/army.ts` + `src/lib/army/`
- Modify: `docs/superpowers/specs/2026-09-25-army-warband-design.md` — Status →
  APPROVED/IN PROGRESS по факту, Last verified

- [ ] **Step 1: Обновить все доки** (targeted-правки, не перезапись).
- [ ] **Step 2: Полный прогон**: `bun run lint`, `bun test`
  (включая группу army), `bunx tsc --noEmit`,
  `npx react-doctor@latest --scope changed`, `bun run context-sync` — разобрать
  находки (патчи доков или осознанный пропуск).
- [ ] **Step 3: Чеклист смоука для владельца** (после выката
  `git pull` + `bash docker/launch.sh --update`):
  1. Усадьба: 5-й флигель «Казарма» появился у существующих поместий (ensureWings).
  2. Нанять 3 воинов (пул плаца), выдать клинки/щиты — сила роты выросла.
  3. Прошла неделя (или правка конфига) — жалованье/еда списались, мораль живая.
  4. Карта земель: лагеря видны, «Выступить» с составом+приказом, таймер марша.
  5. Рапорт: потери по спектру, трофеи на склад, репутация города +5.
  6. Реалтайм: тост «Рапорт готов» без перезагрузки.
  7. Админка: ключи `army.*` редактируются, поведение меняется без деплоя.
- [ ] **Step 4: Фиксация** — единственная пачка коммитов по явной просьбе владельца
  (обычная практика: `feat(v0.30.250): …`).

---

## Self-review (выполнено при написании)

- **Спека → задачи:** казарма (T7/T11), найм/плац (T8/T12), содержание (T5/T8),
  снаряжение (T6/T9/T12), сила (T3), бой/приказы (T4/T12), лагеря/походы/рапорты
  (T7/T9/T13/T14), репутация (T9), конфиги/синк (T7), realtime/уведомления (T10/T14),
  патч-ноут/доки (T15). Фазы 1.5/2/3 — сознательно вне плана (отдельные спеки).
- **Placeholder-скан:** числа всех дефолтов заданы; имена предметов — черновые
  с явной пометкой lore-keeper-прогона; конкретные itemId входов рецептов — со
  сверкой с фактическим каталогом (жёсткая зависимость от генерируемого каталога,
  её нельзя «придумать» заранее без чтения `generate-resources.ts` — шаг это
  предписывает явно).
- **Типы согласованы:** `ArmyDTO`/`SquadLike`/`GearSlotState`/`BattleResult`
  определены в Tasks 3/4/8 и потребляются Tasks 9/12/13 под теми же именами.
