const prisma = require("../config/prisma");
const { validateBlend, blendGrams } = require("../lib/blendRules");

// Prisma returns DECIMAL(5,2) as a Decimal whose JSON form drops trailing zeros
// ("75" for 75.00). Percentages are always presented with two decimals, which
// is what the machine recipe and the storefront expect.
const pct = (d) => (d === null || d === undefined ? null : Number(d).toFixed(2));

// BLEND-<year>-<6-digit id> helpers live in lib/blendRef.js, shared with the
// order webhook, which reads the ref back off each order line for the machine.
const { blendRef, parseBlendId } = require("../lib/blendRef");

// Cart-line attributes Shopify carries through to the order. Phase 3's order
// webhook reads the "Blend ID" key back off each order line, which is how
// production reconnects a paid order to its recipe.
function buildBlendAttributes({ ref, baseTeaName, spices }) {
  const ingredients = spices
    .map((s) => `${s.name} ${s.percentage}%`)
    .join(", ");
  return [
    { key: "Blend ID", value: ref },
    { key: "Base Tea", value: baseTeaName },
    { key: "Ingredients", value: ingredients || "(none)" },
  ];
}

const getTeaOptions = async (req, res) => {
  try {
    // Only offer active options; retired ones stay in the table (for historical
    // recipe lookups) but are hidden from the blend builder. Stable id order.
    const [baseTeas, spices] = await Promise.all([
      // `code` is the permanent identifier the TeaMatrix machine matches on;
      // `name` is display text and may change.
      prisma.base_teas.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true },
        orderBy: { id: "asc" },
      }),
      prisma.spices.findMany({
        where: { is_active: true },
        select: { id: true, code: true, name: true },
        orderBy: { id: "asc" },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        baseTeas,
        spices,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const createCustomBlend = async (req, res) => {
  const { baseTeaId, quantity, baseTeaPercentage, spices } = req.body;

  if (!baseTeaId || !quantity || !Array.isArray(spices)) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all required fields." });
  }

  // Recipe rules (spec v1.1 §3) are checked before anything touches the
  // database, so a bad recipe never reaches a transaction. `error_code` lets
  // the frontend show a specific message.
  const check = validateBlend({ quantity, baseTeaPercentage, spices });
  if (!check.ok) {
    return res
      .status(400)
      .json({ success: false, error_code: check.code, message: check.message });
  }
  const recipe = check.normalized;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Ingredients must exist AND be offered. A retired ingredient would pass
      // the foreign-key check but the machine no longer carries it.
      const baseTea = await tx.base_teas.findUnique({
        where: { id: baseTeaId },
        select: { name: true, is_active: true },
      });
      if (!baseTea || !baseTea.is_active) {
        throw Object.assign(new Error("Invalid base tea."), { code: "INVALID_BASE_TEA" });
      }
      const spiceIds = recipe.spices.map((s) => s.id);
      const spiceRows = spiceIds.length
        ? await tx.spices.findMany({
            where: { id: { in: spiceIds } },
            select: { id: true, name: true, is_active: true },
          })
        : [];
      const spiceById = new Map(spiceRows.map((s) => [s.id, s]));
      const unknown = spiceIds.find((id) => !(spiceById.get(id) && spiceById.get(id).is_active));
      if (unknown !== undefined) {
        throw Object.assign(new Error(`Invalid spice ${unknown}.`), { code: "INVALID_SPICE" });
      }

      const created = await tx.custom_blends.create({
        data: {
          base_tea_id: baseTeaId,
          quantity: recipe.quantity,
          base_tea_percentage: recipe.baseTeaPercentage,
        },
        select: { id: true, created_at: true },
      });

      if (recipe.spices.length > 0) {
        await tx.blend_spices.createMany({
          data: recipe.spices.map((spice) => ({
            blend_id: created.id,
            spice_id: spice.id,
            percentage: spice.percentage,
          })),
        });
      }

      return {
        created,
        baseTeaName: baseTea.name,
        spiceList: recipe.spices.map((s) => ({
          name: spiceById.get(s.id).name,
          percentage: s.percentage,
        })),
      };
    });

    const ref = blendRef(result.created.id, result.created.created_at);
    const lineAttributes = buildBlendAttributes({
      ref,
      baseTeaName: result.baseTeaName,
      spices: result.spiceList,
    });

    // Resolve the recipe into actual grams against the finished pack weight, so
    // the frontend (and fulfillment) can show/verify "75 g Moray + 25 g spice"
    // instead of re-deriving it from percentages. Base = quantity - total spice.
    const g = blendGrams({
      quantity: recipe.quantity,
      baseTeaPercentage: recipe.baseTeaPercentage,
      spices: result.spiceList,
    });

    res.status(201).json({
      success: true,
      message: "Custom tea blend created successfully!",
      data: {
        blendId: result.created.id, // kept for backward compatibility
        blendRef: ref,
        baseTeaPercentage: recipe.baseTeaPercentage,
        // Attach these to the Shopify cart line (POST /storefront/cart/lines)
        // so the recipe travels with the order.
        lineAttributes,
        grams: {
          pack_weight_g: g.packWeightG,
          base: {
            name: result.baseTeaName,
            percentage: g.baseTeaPercentage,
            grams: g.baseGrams,
          },
          spice_total_g: g.spiceTotalGrams,
          spices: g.spices.map((s) => ({
            name: s.name,
            percentage: s.percentage,
            grams: s.grams,
          })),
        },
      },
    });
  } catch (error) {
    // Unknown or retired ingredient (checked inside the transaction).
    if (error.code === "INVALID_BASE_TEA" || error.code === "INVALID_SPICE") {
      return res
        .status(400)
        .json({ success: false, error_code: error.code, message: error.message });
    }

    console.error(error);

    // Foreign key violation -> invalid base tea or spice id.
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid base tea or spice ID provided.",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Server Error while creating blend." });
  }
};

// GET /api/custom-blends/:ref — reconstruct a blend from its reference. Used by
// fulfillment to turn a "Blend ID" on an order back into a full recipe.
const getCustomBlend = async (req, res) => {
  const id = parseBlendId(req.params.ref);
  if (!Number.isInteger(id) || id < 1) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid blend reference." });
  }

  const blend = await prisma.custom_blends.findUnique({
    where: { id },
    include: {
      base_teas: { select: { code: true, name: true } },
      blend_spices: {
        include: { spices: { select: { code: true, name: true } } },
      },
    },
  });

  if (!blend) {
    return res.status(404).json({ success: false, message: "Blend not found." });
  }

  const spices = blend.blend_spices.map((bs) => ({
    code: bs.spices?.code || null,
    name: bs.spices?.name || null,
    percentage: pct(bs.percentage),
  }));

  // Resolve to grams against the finished pack weight. Base takes the remainder,
  // so base + spices always equal exactly `quantity`.
  const g = blendGrams({
    quantity: blend.quantity,
    baseTeaPercentage: blend.base_tea_percentage,
    spices,
  });

  return res.status(200).json({
    success: true,
    data: {
      blendId: blend.id,
      blendRef: blendRef(blend.id, blend.created_at),
      baseTea: blend.base_teas?.name || null,
      baseTeaCode: blend.base_teas?.code || null,
      baseTeaPercentage: pct(blend.base_tea_percentage),
      quantity: blend.quantity,
      createdAt: blend.created_at,
      spices,
      grams: {
        pack_weight_g: g.packWeightG,
        base: {
          name: blend.base_teas?.name || null,
          code: blend.base_teas?.code || null,
          percentage: g.baseTeaPercentage,
          grams: g.baseGrams,
        },
        spice_total_g: g.spiceTotalGrams,
        spices: g.spices.map((s) => ({
          code: s.code,
          name: s.name,
          percentage: s.percentage,
          grams: s.grams,
        })),
      },
    },
  });
};

module.exports = {
  getTeaOptions,
  createCustomBlend,
  getCustomBlend,
  // exported for tests
  blendRef,
  parseBlendId,
  buildBlendAttributes,
};
