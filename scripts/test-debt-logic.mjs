// Одноразовый тест логики долгов: сценарий «я заплатил 200 за себя и друга, друг вернул 100».
// Запуск: bun scripts/test-debt-logic.mjs
import { calculateBalances, calculateSettlements, calculateNetSpent } from "../src/lib/budget/balances.ts";

let failed = 0;
const eq = (label, got, want) => {
  const ok = Math.abs(got - want) < 0.005;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got}, want ${want}`);
};

const me = { id: "u1", name: "Я", emoji: "🙂", color: "#f00", role: "owner", budget: 1000 };
const friend = { id: "u2", name: "Друг", emoji: "😎", color: "#0f0", role: "member", budget: 1000 };
const participants = [me, friend];

// 1. Я заплатил 200 за двоих (по 100 на каждого)
const shared = {
  id: "e1", tripId: "t1", amount: 200, category: "food", description: "Ужин",
  paidById: "u1", dayId: null, splitWith: "u2", excludeSelf: false,
  settlementKey: null, createdAt: new Date().toISOString(),
};
const expenses1 = [shared];

let bal = calculateBalances(expenses1, participants);
eq("до перевода: у меня paid", bal[0].paid, 200);
eq("до перевода: друг должен мне", bal[0].balance, 100);
eq("до перевода: баланс друга", bal[1].balance, -100);

let settlements = calculateSettlements(expenses1, participants);
eq("до перевода: один долг", settlements.length, 1);
eq("до перевода: сумма долга", settlements[0].amount, 100);

// 2. Друг перевёл 100, я нажал «Перевели» → запись settlement
const settlement = {
  id: "e2", tripId: "t1", amount: 100, category: "settlement", description: "Перевод: Друг → Я",
  paidById: "u2", dayId: null, splitWith: "u1", excludeSelf: true,
  settlementKey: "settle-u2-u1-10000-1", createdAt: new Date().toISOString(),
};
const expenses2 = [shared, settlement];

bal = calculateBalances(expenses2, participants);
eq("после перевода: мой баланс 0", bal[0].balance, 0);
eq("после перевода: баланс друга 0", bal[1].balance, 0);
settlements = calculateSettlements(expenses2, participants);
eq("после перевода: долгов нет", settlements.length, 0);

// 3. ГЛАВНОЕ: «Бюджет каждого» — чистые траты с учётом переводов.
// Я: потратил 200, 100 вернули → 100. Друг: 0 потратил, 100 перевёл → 100.
let net = calculateNetSpent(expenses2, participants);
eq("после перевода: мои чистые траты", net.u1, 100);
eq("после перевода: чистые траты друга", net.u2, 100);

// До перевода чистые траты = из кошелька (200 и 0)
net = calculateNetSpent(expenses1, participants);
eq("до перевода: мои чистые траты", net.u1, 200);
eq("до перевода: чистые траты друга", net.u2, 0);

// 4. Сумма чистых трат всегда = сумме реальных трат (инвариант «сумма бюджетов участников»)
eq("инвариант: сумма = totalSpent", net.u1 + net.u2, 200);

// 5. Трое участников: A заплатил 300 за троих (по 100), B вернул 100, C ещё нет.
// Семантика «из кошелька»: A=300−100=200, B=0+100=100, C=0 (пока ничего не платил).
const c = { id: "u3", name: "Третий", emoji: "🧐", color: "#00f", role: "member", budget: 1000 };
const e3 = { ...shared, id: "e3", amount: 300, splitWith: "u2,u3", excludeSelf: false };
const s3 = { ...settlement, id: "e4", amount: 100, splitWith: "u1", settlementKey: "settle-u2-u1-10000-2" };
const net3 = calculateNetSpent([e3, s3], [me, friend, c]);
eq("3 участника: A", net3.u1, 200);
eq("3 участника: B", net3.u2, 100);
eq("3 участника: C (ещё не вернул)", net3.u3, 0);
eq("3 участника: инвариант", net3.u1 + net3.u2 + net3.u3, 300);

// 6. Личные траты без split — не меняются
const personal = { ...shared, id: "e5", amount: 50, splitWith: "", excludeSelf: false };
const net4 = calculateNetSpent([personal], participants);
eq("личная трата: paid", net4.u1, 50);

// 7. Встречные долги: A платил 100 за двоих (B должен 50), B платил 60 за двоих (A должен 30)
// → нетто B→A 20; B вернул 20 → долги обнулены, у каждого из кошелька вышло по 80 (100−20 и 60+20)
const eA = { ...shared, id: "e6", amount: 100, paidById: "u1", splitWith: "u2" };
const eB = { ...shared, id: "e7", amount: 60, paidById: "u2", splitWith: "u1" };
const s70 = { ...settlement, id: "e8", amount: 20, paidById: "u2", splitWith: "u1" };
const bal7 = calculateBalances([eA, eB, s70], participants);
eq("встречные долги: баланс A", bal7[0].balance, 0);
eq("встречные долги: баланс B", bal7[1].balance, 0);
const set7 = calculateSettlements([eA, eB, s70], participants);
eq("встречные долги: долгов нет", set7.length, 0);
const net7 = calculateNetSpent([eA, eB, s70], participants);
eq("встречные долги: netSpent A", net7.u1, 80);
eq("встречные долги: netSpent B", net7.u2, 80);
eq("встречные долги: инвариант", net7.u1 + net7.u2, 160);

if (failed > 0) {
  console.error(`\n${failed} проверок провалено`);
  process.exit(1);
}
console.log("\nВсе проверки пройдены");
