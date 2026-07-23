import { db } from "../src/lib/db";

// Плановый бюджет по категориям (из плана путешествия)
const BUDGET_PLANS = [
  { category: "accommodation", amount: 400 },
  { category: "food", amount: 300 },
  { category: "transport", amount: 150 },
  { category: "attractions", amount: 100 },
  { category: "casino", amount: 100 },
  { category: "shopping", amount: 50 },
];

async function main() {
  console.log("🌱 Seeding budget plans...");
  await db.budgetPlan.deleteMany();
  for (const p of BUDGET_PLANS) {
    await db.budgetPlan.create({ data: p });
  }
  console.log(`✓ Created ${BUDGET_PLANS.length} budget plans`);
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
