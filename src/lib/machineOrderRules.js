// machineOrderRules.js
// Pure rules for the TeaMatrix machine_orders rows (spec v1.1 §4, §5, §8.1).
// No database access here — see machineOrderStore.js for the writes and
// tests/machineOrderRules.test.js for the behaviour pinned by the spec.

const { toHundredths, fromHundredths, MIN_WEIGHT_G, MAX_WEIGHT_G } = require("./blendRules");

// ---- payment_status (§8.1) -------------------------------------------------

// Ranks for the forward-only rule (§5.4): a webhook may apply a status only if
// its rank is higher than the current one, so a late or out-of-order delivery
// can never move an order backwards (e.g. make a cancelled order look paid).
const PAYMENT_RANK = Object.freeze({
  pending: 1,
  paid: 2,
  partially_refunded: 3,
  refunded: 4,
  cancelled: 5,
});

/**
 * Map a Shopify order payload to our payment_status. Returns null when the
 * payload says nothing we recognise, in which case the caller keeps the current
 * value and logs a warning (§8.1 "anything else").
 */
function derivePaymentStatus(payload) {
  if (!payload) return null;
  if (payload.cancelled_at) return "cancelled";
  switch (payload.financial_status) {
    case "voided":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "paid":
      return "paid";
    case "pending":
    case "authorized":
    case "partially_paid":
      return "pending";
    default:
      return null;
  }
}

/** True when `next` may replace `current` under the forward-only rule. */
function paymentStatusAdvances(current, next) {
  if (!next || !(next in PAYMENT_RANK)) return false;
  if (!current || !(current in PAYMENT_RANK)) return true;
  return PAYMENT_RANK[next] > PAYMENT_RANK[current];
}

// ---- which line items are blends (§5.2) -----------------------------------

/**
 * The Shopify product id of "Custom Blend Tea". Lines are matched on this id
 * from config, never on title. Unset (the storefront's custom-blend page is
 * currently disabled) means no line is a blend and no machine row is written.
 */
function customBlendProductId() {
  const raw = process.env.CUSTOM_BLEND_PRODUCT_ID;
  return raw && String(raw).trim() !== "" ? String(raw).trim() : null;
}

function isCustomBlendLine(item, productId = customBlendProductId()) {
  if (!productId || !item || item.product_id === null || item.product_id === undefined) return false;
  return String(item.product_id) === productId;
}

// ---- test orders (§5.2 is_test) -------------------------------------------

const TEST_ATTR_KEY = /^(source|environment|env|channel)$/i;
const TEST_ATTR_VALUE = /^(uat|test|testing|staging)$/i;
const TEST_TAG = /^(uat|test|test-order|staging)$/i;

/**
 * A test order never reaches the machine. Three signals, any of which is
 * enough:
 *   1. Shopify's own `test: true` (test gateway / Bogus gateway orders);
 *   2. a cart attribute the UAT storefront sets at checkout, delivered as a
 *      note attribute, e.g. { name: "source", value: "uat" };
 *   3. an order tag of "uat" or "test", so staff can hide a stray order by
 *      hand in Shopify admin without touching the backend.
 */
function isTestOrder(payload) {
  if (!payload) return false;
  if (payload.test === true) return true;

  const attrs = Array.isArray(payload.note_attributes) ? payload.note_attributes : [];
  if (
    attrs.some(
      (a) => a && TEST_ATTR_KEY.test(String(a.name || "")) && TEST_ATTR_VALUE.test(String(a.value || ""))
    )
  ) {
    return true;
  }

  const tags = typeof payload.tags === "string" ? payload.tags.split(",") : Array.isArray(payload.tags) ? payload.tags : [];
  return tags.some((t) => TEST_TAG.test(String(t).trim()));
}

// ---- customer display name (§4.1) -----------------------------------------

/**
 * "Amal P." — first name plus last initial, enough to hand an order over at
 * the counter. Never the email, address or phone; this renders on a shop-floor
 * screen. Falls back through customer -> shipping -> billing, then null.
 */
function customerDisplayName(payload) {
  if (!payload) return null;
  const sources = [payload.customer, payload.shipping_address, payload.billing_address];
  for (const src of sources) {
    if (!src) continue;
    const first = String(src.first_name || "").trim();
    const last = String(src.last_name || "").trim();
    if (!first && !last) continue;
    const name = first ? `${first}${last ? ` ${last[0].toUpperCase()}.` : ""}` : `${last[0].toUpperCase()}.`;
    return name.slice(0, 100);
  }
  return null;
}

// ---- the frozen recipe (§4.3) and its checks (§5.3) -----------------------

/**
 * Build recipe_json from a custom_blends row loaded with its base tea and
 * spices, and run the creation-time checks. Returns
 *   { recipe, totalWeightG, validationError }
 * where validationError is null when the recipe is sound. A failed check still
 * yields a recipe (what we have) so the row can be inspected, but the caller
 * stores the error and the machine never sees the row (§7.1 filters it out).
 *
 * @param {object|null} blend  custom_blends row with base_teas and
 *                             blend_spices[].spices included; null if not found
 */
function buildRecipe(blend) {
  if (!blend) {
    return { recipe: null, totalWeightG: null, validationError: "BLEND_NOT_FOUND" };
  }

  const base = blend.base_teas;
  const spices = Array.isArray(blend.blend_spices) ? blend.blend_spices : [];

  const baseH = toHundredths(blend.base_tea_percentage);
  const ingredients = [];
  if (base && base.code) {
    ingredients.push({
      role: "base",
      code: base.code,
      name: base.name,
      percentage: Number.isFinite(baseH) ? fromHundredths(baseH) : null,
    });
  }
  for (const bs of spices) {
    const h = toHundredths(bs.percentage);
    ingredients.push({
      role: "addition",
      code: bs.spices ? bs.spices.code : null,
      name: bs.spices ? bs.spices.name : null,
      percentage: Number.isFinite(h) ? fromHundredths(h) : null,
    });
  }
  const recipe = { ingredients };
  const totalWeightG = Number.isInteger(blend.quantity) ? blend.quantity : null;

  let validationError = null;
  if (ingredients.filter((i) => i.role === "base").length !== 1 || !Number.isFinite(baseH) || baseH <= 0) {
    validationError = "INVALID_BASE_TEA";
  } else if (ingredients.some((i) => i.percentage === null || !i.code)) {
    validationError = "PERCENTAGE_SUM";
  } else {
    const sum = ingredients.reduce((acc, i) => acc + toHundredths(i.percentage), 0);
    if (sum !== 10000) validationError = "PERCENTAGE_SUM";
  }
  if (!validationError && (totalWeightG === null || totalWeightG < MIN_WEIGHT_G || totalWeightG > MAX_WEIGHT_G)) {
    validationError = "WEIGHT_OUT_OF_RANGE";
  }

  return { recipe, totalWeightG, validationError };
}

module.exports = {
  PAYMENT_RANK,
  derivePaymentStatus,
  paymentStatusAdvances,
  customBlendProductId,
  isCustomBlendLine,
  isTestOrder,
  customerDisplayName,
  buildRecipe,
};
