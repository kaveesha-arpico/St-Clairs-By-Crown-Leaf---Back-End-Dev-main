// Recipe rules for custom blends (TeaMatrix spec v1.1 §3 and the acceptance
// checklist in §12). Pure functions, no database.

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = "test";
delete process.env.BLEND_MIN_INGREDIENT_G;

const { validateBlend, toHundredths } = require("../src/lib/blendRules");

const ok = (b) => {
  const r = validateBlend(b);
  assert.strictEqual(r.ok, true, `${JSON.stringify(b)} -> ${r.code}: ${r.message}`);
  return r.normalized;
};
const bad = (b, code) => {
  const r = validateBlend(b);
  assert.strictEqual(r.ok, false, `${JSON.stringify(b)} should fail with ${code}`);
  assert.strictEqual(r.code, code, `${JSON.stringify(b)} -> ${r.code}: ${r.message}`);
};

test("percentages are compared in hundredths, not floats", () => {
  // 33.33 + 33.33 + 33.34 is not exactly 100 in floating point.
  ok({
    quantity: 50,
    baseTeaPercentage: 33.34,
    spices: [{ id: 1, percentage: 33.33 }, { id: 2, percentage: 33.33 }],
  });
  assert.strictEqual(toHundredths("83.33"), 8333);
  assert.strictEqual(toHundredths(6.25), 625);
  assert.ok(Number.isNaN(toHundredths("33.333")), "3 decimals must be rejected, not rounded");
  assert.ok(Number.isNaN(toHundredths("abc")));
});

test("sum must be exactly 100.00: 99.99 and 100.01 fail, 100.00 passes", () => {
  bad({ quantity: 50, baseTeaPercentage: 89.99, spices: [{ id: 1, percentage: 10 }] }, "PERCENTAGE_SUM");
  bad({ quantity: 50, baseTeaPercentage: 90.01, spices: [{ id: 1, percentage: 10 }] }, "PERCENTAGE_SUM");
  ok({ quantity: 50, baseTeaPercentage: 90, spices: [{ id: 1, percentage: 10 }] });
});

test("weight: 201 g fails, 200 g passes, 1 g passes, 0 and non-integers fail", () => {
  bad({ quantity: 201, baseTeaPercentage: 100, spices: [] }, "WEIGHT_OUT_OF_RANGE");
  ok({ quantity: 200, baseTeaPercentage: 100, spices: [] });
  ok({ quantity: 1, baseTeaPercentage: 100, spices: [] });
  bad({ quantity: 0, baseTeaPercentage: 100, spices: [] }, "WEIGHT_OUT_OF_RANGE");
  bad({ quantity: 50.5, baseTeaPercentage: 100, spices: [] }, "WEIGHT_OUT_OF_RANGE");
  bad({ quantity: "50", baseTeaPercentage: 100, spices: [] }, "WEIGHT_OUT_OF_RANGE");
});

test("a tea-only blend (base at 100.00, no spices) is allowed", () => {
  const n = ok({ quantity: 100, baseTeaPercentage: "100.00", spices: [] });
  assert.strictEqual(n.baseTeaPercentage, "100.00");
  assert.deepStrictEqual(n.spices, []);
});

test("spices: at most 7, no duplicates, each > 0", () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, percentage: 10 }));
  ok({ quantity: 50, baseTeaPercentage: 30, spices: seven });
  const eight = [...seven, { id: 8, percentage: 1 }];
  bad({ quantity: 50, baseTeaPercentage: 29, spices: eight }, "TOO_MANY_SPICES");
  bad(
    { quantity: 50, baseTeaPercentage: 80, spices: [{ id: 3, percentage: 10 }, { id: 3, percentage: 10 }] },
    "DUPLICATE_SPICE"
  );
  bad({ quantity: 50, baseTeaPercentage: 100, spices: [{ id: 3, percentage: 0 }] }, "INVALID_PERCENTAGE");
  bad({ quantity: 50, baseTeaPercentage: 100, spices: [{ id: 3, percentage: -5 }] }, "INVALID_PERCENTAGE");
  bad({ quantity: 50, baseTeaPercentage: 90, spices: [{ id: "x", percentage: 10 }] }, "INVALID_SPICE");
});

test("baseTeaPercentage may be omitted (pre-v1.1 clients): it is derived from the remainder", () => {
  // The old request shape sent only spices. Keep it working.
  const n = ok({ quantity: 50, spices: [{ id: 3, percentage: 10.42 }, { id: 11, percentage: 6.25 }] });
  assert.strictEqual(n.baseTeaPercentage, "83.33");
  // ...but spices alone must still leave a positive share for the base tea.
  bad({ quantity: 50, spices: [{ id: 3, percentage: 60 }, { id: 11, percentage: 40 }] }, "PERCENTAGE_SUM");
  bad({ quantity: 50, spices: [{ id: 3, percentage: 60 }, { id: 11, percentage: 50 }] }, "PERCENTAGE_SUM");
});

test("normalized output uses 2-decimal strings, as DECIMAL(5,2) and the machine expect", () => {
  const n = ok({ quantity: 24, baseTeaPercentage: 83.33, spices: [{ id: 3, percentage: 10.42 }, { id: 11, percentage: "6.25" }] });
  assert.deepStrictEqual(n, {
    quantity: 24,
    baseTeaPercentage: "83.33",
    spices: [{ id: 3, percentage: "10.42" }, { id: 11, percentage: "6.25" }],
  });
});

test("BLEND_MIN_INGREDIENT_G: 0/unset disables the check; a value enforces grams per ingredient", () => {
  // Unset -> a 1 g blend with a 1% spice (0.01 g) is fine.
  ok({ quantity: 1, baseTeaPercentage: 99, spices: [{ id: 1, percentage: 1 }] });

  process.env.BLEND_MIN_INGREDIENT_G = "2";
  try {
    // 50 g x 1% = 0.5 g < 2 g -> rejected.
    bad({ quantity: 50, baseTeaPercentage: 99, spices: [{ id: 1, percentage: 1 }] }, "MIN_INGREDIENT");
    // 50 g x 4% = 2.0 g -> exactly the minimum passes.
    ok({ quantity: 50, baseTeaPercentage: 96, spices: [{ id: 1, percentage: 4 }] });
    // The base tea is an ingredient too: 10 g x 10% = 1 g base -> rejected.
    bad({ quantity: 10, baseTeaPercentage: 10, spices: [{ id: 1, percentage: 90 }] }, "MIN_INGREDIENT");
  } finally {
    delete process.env.BLEND_MIN_INGREDIENT_G;
  }
});
