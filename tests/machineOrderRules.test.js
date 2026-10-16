// Rules for the TeaMatrix machine_orders rows (spec v1.1 §4, §5, §8.1).
// Pure functions, no database.

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = "test";

const {
  PAYMENT_RANK,
  derivePaymentStatus,
  paymentStatusAdvances,
  isCustomBlendLine,
  isTestOrder,
  customerDisplayName,
  buildRecipe,
} = require("../src/lib/machineOrderRules");

// ---- §8.1 payment_status from the Shopify payload ----

test("payment_status mapping follows §8.1", () => {
  assert.strictEqual(derivePaymentStatus({ financial_status: "paid" }), "paid");
  assert.strictEqual(derivePaymentStatus({ financial_status: "pending" }), "pending");
  assert.strictEqual(derivePaymentStatus({ financial_status: "authorized" }), "pending");
  assert.strictEqual(derivePaymentStatus({ financial_status: "partially_paid" }), "pending");
  assert.strictEqual(derivePaymentStatus({ financial_status: "partially_refunded" }), "partially_refunded");
  assert.strictEqual(derivePaymentStatus({ financial_status: "refunded" }), "refunded");
  assert.strictEqual(derivePaymentStatus({ financial_status: "voided" }), "cancelled");
  // cancelled_at wins over whatever financial_status says.
  assert.strictEqual(derivePaymentStatus({ financial_status: "paid", cancelled_at: "2026-09-15T11:00:00Z" }), "cancelled");
  // Anything else -> null (caller keeps the current value and logs).
  assert.strictEqual(derivePaymentStatus({ financial_status: "something_new" }), null);
  assert.strictEqual(derivePaymentStatus({}), null);
});

test("payment status only moves forward (§5.4)", () => {
  assert.deepStrictEqual(PAYMENT_RANK, { pending: 1, paid: 2, partially_refunded: 3, refunded: 4, cancelled: 5 });
  assert.strictEqual(paymentStatusAdvances("pending", "paid"), true);
  assert.strictEqual(paymentStatusAdvances("paid", "pending"), false, "late orders/create must not un-pay");
  assert.strictEqual(paymentStatusAdvances("paid", "paid"), false, "same status is a no-op");
  assert.strictEqual(paymentStatusAdvances("paid", "cancelled"), true);
  assert.strictEqual(paymentStatusAdvances("cancelled", "paid"), false, "nothing moves back from cancelled");
  assert.strictEqual(paymentStatusAdvances("refunded", "partially_refunded"), false);
  assert.strictEqual(paymentStatusAdvances("paid", null), false, "unrecognised -> keep current");
  assert.strictEqual(paymentStatusAdvances(null, "pending"), true, "first write always applies");
});

// ---- §5.2 which lines are blends ----

test("a line is a blend only when its product id equals CUSTOM_BLEND_PRODUCT_ID", () => {
  assert.strictEqual(isCustomBlendLine({ product_id: "123", title: "Custom Blend Tea" }, "123"), true);
  assert.strictEqual(isCustomBlendLine({ product_id: "999", title: "Custom Blend Tea" }, "123"), false, "title never matches");
  assert.strictEqual(isCustomBlendLine({ product_id: 123 }, "123"), true, "numeric id compares as string");
  assert.strictEqual(isCustomBlendLine({ product_id: "123" }, null), false, "unconfigured -> nothing is a blend");
  assert.strictEqual(isCustomBlendLine({}, "123"), false);
});

// ---- §5.2 is_test ----

test("test orders are detected from Shopify's test flag, a UAT cart attribute, or a tag", () => {
  assert.strictEqual(isTestOrder({ test: true }), true);
  assert.strictEqual(isTestOrder({ test: false }), false);
  assert.strictEqual(isTestOrder({ note_attributes: [{ name: "source", value: "uat" }] }), true);
  assert.strictEqual(isTestOrder({ note_attributes: [{ name: "Source", value: "UAT" }] }), true);
  assert.strictEqual(isTestOrder({ note_attributes: [{ name: "source", value: "web" }] }), false);
  assert.strictEqual(isTestOrder({ tags: "vip, test" }), true);
  assert.strictEqual(isTestOrder({ tags: "vip, wholesale" }), false);
  assert.strictEqual(isTestOrder({}), false);
});

// ---- §4.1 display name: first name + initial, never PII ----

test("customer_display_name is first name plus last initial, with fallbacks", () => {
  assert.strictEqual(customerDisplayName({ customer: { first_name: "Amal", last_name: "Perera", email: "x@y.z" } }), "Amal P.");
  assert.strictEqual(customerDisplayName({ customer: { first_name: "Amal" } }), "Amal");
  assert.strictEqual(customerDisplayName({ shipping_address: { first_name: "Nadia", last_name: "khan" } }), "Nadia K.");
  assert.strictEqual(customerDisplayName({ customer: {}, billing_address: { last_name: "Silva" } }), "S.");
  assert.strictEqual(customerDisplayName({}), null);
});

// ---- §4.3 recipe_json and §5.3 checks ----

const goodBlend = {
  id: 42,
  quantity: 24,
  base_tea_percentage: "83.33",
  created_at: new Date("2026-09-15T10:00:00Z"),
  base_teas: { code: "STRATHSPEY_BOPF", name: "Strathspey BOPF" },
  blend_spices: [
    { percentage: "10.42", spices: { code: "CINNAMON_CHIPS", name: "Cinnamon" } },
    { percentage: "6.25", spices: { code: "ORANGE_PEEL", name: "Orange Peel" } },
  ],
};

test("recipe_json: one base entry first, two-decimal string percentages", () => {
  const { recipe, totalWeightG, validationError } = buildRecipe(goodBlend);
  assert.strictEqual(validationError, null);
  assert.strictEqual(totalWeightG, 24);
  assert.deepStrictEqual(recipe, {
    ingredients: [
      { role: "base", code: "STRATHSPEY_BOPF", name: "Strathspey BOPF", percentage: "83.33" },
      { role: "addition", code: "CINNAMON_CHIPS", name: "Cinnamon", percentage: "10.42" },
      { role: "addition", code: "ORANGE_PEEL", name: "Orange Peel", percentage: "6.25" },
    ],
  });
});

test("recipe_json: a tea-only blend is one entry at 100.00", () => {
  const { recipe, validationError } = buildRecipe({ ...goodBlend, base_tea_percentage: "100.00", blend_spices: [] });
  assert.strictEqual(validationError, null);
  assert.deepStrictEqual(recipe.ingredients, [
    { role: "base", code: "STRATHSPEY_BOPF", name: "Strathspey BOPF", percentage: "100.00" },
  ]);
});

test("validation_error codes from §5.3", () => {
  assert.strictEqual(buildRecipe(null).validationError, "BLEND_NOT_FOUND");
  assert.strictEqual(buildRecipe({ ...goodBlend, base_teas: null }).validationError, "INVALID_BASE_TEA");
  assert.strictEqual(buildRecipe({ ...goodBlend, base_tea_percentage: "83.34" }).validationError, "PERCENTAGE_SUM");
  assert.strictEqual(buildRecipe({ ...goodBlend, quantity: 201 }).validationError, "WEIGHT_OUT_OF_RANGE");
  assert.strictEqual(buildRecipe({ ...goodBlend, quantity: 0 }).validationError, "WEIGHT_OUT_OF_RANGE");
  // A legacy blend with a spice that has no code cannot be made by the machine.
  assert.strictEqual(
    buildRecipe({ ...goodBlend, blend_spices: [{ percentage: "16.67", spices: { code: null, name: "Mystery" } }] }).validationError,
    "PERCENTAGE_SUM"
  );
});
