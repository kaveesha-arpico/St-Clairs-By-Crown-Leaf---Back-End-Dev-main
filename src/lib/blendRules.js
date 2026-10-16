// blendRules.js
// The recipe rules a custom blend must satisfy before it is stored (TeaMatrix
// spec v1.1 §3). The website enforces them at creation time because that is
// where a customer can be told to fix the blend; the machine re-checks the same
// rules on its side. Pure functions, no database — see tests/blendRules.test.js.
//
// Percentages are compared in integer HUNDREDTHS. Float addition of
// 33.33 + 33.33 + 33.34 is not reliably 100, so every percentage is turned into
// Math.round(p * 100) and the sum compared with 10000.

const MIN_WEIGHT_G = 1;
const MAX_WEIGHT_G = 200; // raised from 100 in spec v1.1; the machine runs large blends in several passes
const MAX_SPICES = 7;
const HUNDRED = 10000; // 100.00 in hundredths

// Smallest amount of any one ingredient the machine can dispense accurately.
// Config, not a constant: the machine team supplies the value once measured and
// both sides change it at the same time. 0 (the default) disables the check.
function minIngredientG() {
  const raw = process.env.BLEND_MIN_INGREDIENT_G;
  const n = raw === undefined || raw === "" ? 0 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// "83.33" | 83.33 -> 8333. Returns NaN for anything that is not a number with
// at most two decimal places (so "33.333" is rejected rather than rounded).
function toHundredths(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

// Formats hundredths back as a 2-decimal string ("8333" -> "83.33"), which is
// what DECIMAL(5,2) columns and the machine's recipe JSON expect.
function fromHundredths(h) {
  return (h / 100).toFixed(2);
}

/**
 * Validate a blend. Returns { ok: true, normalized } or { ok: false, code, message }.
 *
 * @param {object} blend
 * @param {number} blend.quantity           grams per unit (integer)
 * @param {*}      [blend.baseTeaPercentage] base tea share; if omitted it is
 *                                          derived as 100 - sum(spices) so the
 *                                          pre-v1.1 request shape still works
 * @param {Array<{id:number, percentage:*}>} blend.spices
 */
function validateBlend({ quantity, baseTeaPercentage, spices }) {
  const fail = (code, message) => ({ ok: false, code, message });

  // ---- weight ----
  if (!Number.isInteger(quantity) || quantity < MIN_WEIGHT_G || quantity > MAX_WEIGHT_G) {
    return fail(
      "WEIGHT_OUT_OF_RANGE",
      `quantity must be a whole number of grams from ${MIN_WEIGHT_G} to ${MAX_WEIGHT_G}.`
    );
  }

  // ---- spices: 0..7, no duplicates, each > 0 with <= 2 decimals ----
  const list = Array.isArray(spices) ? spices : [];
  if (list.length > MAX_SPICES) {
    return fail("TOO_MANY_SPICES", `A blend may have at most ${MAX_SPICES} spices.`);
  }
  const seen = new Set();
  const spiceH = [];
  for (const s of list) {
    const id = s && s.id;
    if (!Number.isInteger(id) || id < 1) {
      return fail("INVALID_SPICE", "Each spice needs a positive integer id.");
    }
    if (seen.has(id)) {
      return fail("DUPLICATE_SPICE", `Spice ${id} is listed more than once.`);
    }
    seen.add(id);
    const h = toHundredths(s.percentage);
    if (!Number.isFinite(h) || h <= 0) {
      return fail(
        "INVALID_PERCENTAGE",
        `Spice ${id}: percentage must be greater than 0 with at most 2 decimal places.`
      );
    }
    spiceH.push({ id, h });
  }
  const spiceSum = spiceH.reduce((acc, s) => acc + s.h, 0);

  // ---- base tea percentage: given, or derived from the remainder ----
  let baseH;
  if (baseTeaPercentage === undefined || baseTeaPercentage === null || baseTeaPercentage === "") {
    baseH = HUNDRED - spiceSum;
    if (baseH <= 0) {
      return fail(
        "PERCENTAGE_SUM",
        "Spice percentages must leave a positive share for the base tea (total under 100.00)."
      );
    }
  } else {
    baseH = toHundredths(baseTeaPercentage);
    if (!Number.isFinite(baseH) || baseH <= 0) {
      return fail(
        "INVALID_PERCENTAGE",
        "baseTeaPercentage must be greater than 0 with at most 2 decimal places."
      );
    }
    if (baseH + spiceSum !== HUNDRED) {
      return fail(
        "PERCENTAGE_SUM",
        `Base tea plus spices must total exactly 100.00 (got ${fromHundredths(baseH + spiceSum)}).`
      );
    }
  }

  // ---- minimum grams per ingredient ----
  const minG = minIngredientG();
  if (minG > 0) {
    const grams = (h) => (quantity * h) / HUNDRED;
    if (grams(baseH) < minG) {
      return fail(
        "MIN_INGREDIENT",
        `Base tea would be ${grams(baseH).toFixed(2)} g; the minimum per ingredient is ${minG} g.`
      );
    }
    for (const s of spiceH) {
      if (grams(s.h) < minG) {
        return fail(
          "MIN_INGREDIENT",
          `Spice ${s.id} would be ${grams(s.h).toFixed(2)} g; the minimum per ingredient is ${minG} g.`
        );
      }
    }
  }

  return {
    ok: true,
    normalized: {
      quantity,
      baseTeaPercentage: fromHundredths(baseH),
      spices: spiceH.map((s) => ({ id: s.id, percentage: fromHundredths(s.h) })),
    },
  };
}

module.exports = {
  validateBlend,
  toHundredths,
  fromHundredths,
  minIngredientG,
  MIN_WEIGHT_G,
  MAX_WEIGHT_G,
  MAX_SPICES,
};
