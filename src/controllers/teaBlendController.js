const prisma = require("../config/prisma");

// Human-readable, traceable reference for a blend: BLEND-<year>-<6-digit id>.
// Derived from the numeric custom_blends.id (the source of truth), so no extra
// column is needed and a reference always reverses back to one recipe.
function blendRef(id, createdAt) {
  const year = (createdAt ? new Date(createdAt) : new Date()).getFullYear();
  return `BLEND-${year}-${String(id).padStart(6, "0")}`;
}

// Accepts "BLEND-2026-000042", "000042", or "42" and returns the numeric id.
function parseBlendId(ref) {
  const match = String(ref).match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : NaN;
}

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
    const [baseTeas, spices] = await Promise.all([
      prisma.base_teas.findMany({ select: { id: true, name: true } }),
      prisma.spices.findMany({ select: { id: true, name: true } }),
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
  const { baseTeaId, quantity, spices } = req.body;

  if (!baseTeaId || !quantity || !Array.isArray(spices) || spices.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all required fields." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.custom_blends.create({
        data: { base_tea_id: baseTeaId, quantity },
        select: { id: true, created_at: true },
      });

      await tx.blend_spices.createMany({
        data: spices.map((spice) => ({
          blend_id: created.id,
          spice_id: spice.id,
          percentage: spice.percentage,
        })),
      });

      // Resolve names for the human-readable cart-line attributes. The FK checks
      // above have already passed, so these rows exist.
      const baseTea = await tx.base_teas.findUnique({
        where: { id: baseTeaId },
        select: { name: true },
      });
      const spiceRows = await tx.spices.findMany({
        where: { id: { in: spices.map((s) => s.id) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(spiceRows.map((s) => [s.id, s.name]));

      return {
        created,
        baseTeaName: baseTea?.name || "Unknown",
        spiceList: spices.map((s) => ({
          name: nameById.get(s.id) || `Spice ${s.id}`,
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

    res.status(201).json({
      success: true,
      message: "Custom tea blend created successfully!",
      data: {
        blendId: result.created.id, // kept for backward compatibility
        blendRef: ref,
        // Attach these to the Shopify cart line (POST /storefront/cart/lines)
        // so the recipe travels with the order.
        lineAttributes,
      },
    });
  } catch (error) {
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
      base_teas: { select: { name: true } },
      blend_spices: { include: { spices: { select: { name: true } } } },
    },
  });

  if (!blend) {
    return res.status(404).json({ success: false, message: "Blend not found." });
  }

  return res.status(200).json({
    success: true,
    data: {
      blendId: blend.id,
      blendRef: blendRef(blend.id, blend.created_at),
      baseTea: blend.base_teas?.name || null,
      quantity: blend.quantity,
      createdAt: blend.created_at,
      spices: blend.blend_spices.map((bs) => ({
        name: bs.spices?.name || null,
        percentage: bs.percentage,
      })),
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
