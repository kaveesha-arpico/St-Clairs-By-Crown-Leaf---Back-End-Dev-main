// The ingredient catalogue the TeaMatrix machine matches on (spec v1.1 §2).
//
// Runs without a database: it checks the seed's declared data, which is what
// `npm run db:seed` writes and what the machine's own catalogue was agreed
// against. A code never changes once shipped and is never reused, so this file
// pins the exact agreed set — a changed or missing code fails loudly here
// before it can silently stop the machine recognising an ingredient.

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = "test";

const { BASE_TEAS, SPICES } = require("../prisma/seed");

// Agreed with TeaMatrix on 2026-10-16. Do not edit without a spec change.
const AGREED_BASE_TEAS = [
  "STRATHSPEY_BOPF",
  "LAXAPANA_PEKOE",
  "MORAY_BOP",
  "MASKELIYA_SILVER_TIPS",
  "GLENTILT_GOLDEN_TIPS",
];
const AGREED_SPICES = [
  "CINNAMON_CHIPS",
  "GINGER_PIECES",
  "ORANGE_PEEL",
  "LEMON_PEEL",
  "LEMONGRASS",
  "ROSE_PETALS",
  "JASMINE_PETALS",
];

test("seed declares exactly the 12 agreed ingredient codes", () => {
  assert.deepStrictEqual(BASE_TEAS.map((t) => t.code).sort(), [...AGREED_BASE_TEAS].sort());
  assert.deepStrictEqual(SPICES.map((s) => s.code).sort(), [...AGREED_SPICES].sort());
  assert.strictEqual(BASE_TEAS.length + SPICES.length, 12);
});

test("every seeded ingredient is active (retired ones are not re-seeded)", () => {
  for (const row of [...BASE_TEAS, ...SPICES]) {
    assert.strictEqual(row.is_active, true, `${row.code} is seeded inactive`);
  }
});

test("codes are UPPER_SNAKE_CASE, unique across both tables, and fit VARCHAR(40)", () => {
  const all = [...BASE_TEAS, ...SPICES].map((r) => r.code);
  assert.strictEqual(new Set(all).size, all.length, "duplicate code");
  for (const code of all) {
    assert.match(code, /^[A-Z][A-Z0-9_]*$/, `${code} is not UPPER_SNAKE_CASE`);
    assert.ok(code.length <= 40, `${code} exceeds 40 chars`);
  }
});

test("every seeded row has a non-empty display name", () => {
  for (const row of [...BASE_TEAS, ...SPICES]) {
    assert.ok(typeof row.name === "string" && row.name.trim().length > 0, row.code);
  }
});
