// productTraceController.js
// Admin CRUD for per-product trace details: Ingredients, Package Weight, and
// the reorder link shown on the public trace page.
//
// Keyed by the SHOPIFY product id, not an id of our own, because that is what
// an order line carries. The id is a string throughout — Shopify ids exceed
// JavaScript's safe integer range and would be silently rounded as numbers.
//
// There is no POST: the key comes from Shopify rather than from us, so there is
// nothing to allocate. PUT creates or updates, which also makes the admin
// screen simpler — staff pick a product and save, without caring whether a row
// already existed.
//
// Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");

// GET /api/admin/product-info
exports.listProductInfo = async (req, res) => {
  const rows = await prisma.product_trace_info.findMany({
    orderBy: { shopify_product_id: "asc" },
  });
  res.status(200).json(rows);
};

// GET /api/admin/product-info/:shopifyProductId
exports.getProductInfo = async (req, res) => {
  const row = await prisma.product_trace_info.findUnique({
    where: { shopify_product_id: String(req.params.shopifyProductId) },
  });
  if (!row) {
    // A product with no trace details yet is a normal, expected state — the
    // admin screen shows an empty form rather than an error.
    return res
      .status(404)
      .json({ message: "No trace details saved for that product yet." });
  }
  res.status(200).json(row);
};

// PUT /api/admin/product-info/:shopifyProductId
// Creates or updates. Unlike the other admin endpoints this is a full replace,
// not a partial update: the screen is one small form that always posts every
// field, and a partial update would make "clear this field" impossible to express.
exports.upsertProductInfo = async (req, res) => {
  const shopifyProductId = String(req.params.shopifyProductId);
  const { title, ingredients, package_weight_g, product_url } = req.body;

  const data = {
    title: title ?? null,
    ingredients: ingredients ?? null,
    package_weight_g:
      package_weight_g === undefined || package_weight_g === null
        ? null
        : Number(package_weight_g),
    product_url: product_url ?? null,
    updated_at: new Date(),
  };

  const row = await prisma.product_trace_info.upsert({
    where: { shopify_product_id: shopifyProductId },
    update: data,
    create: { shopify_product_id: shopifyProductId, ...data },
  });

  res.status(200).json(row);
};

// DELETE /api/admin/product-info/:shopifyProductId
// Safe to delete outright: this record holds presentation details only, not
// provenance. Removing it just means the trace page omits those rows — no
// shipped order loses its estate, factory or packed date.
exports.deleteProductInfo = async (req, res) => {
  try {
    await prisma.product_trace_info.delete({
      where: { shopify_product_id: String(req.params.shopifyProductId) },
    });
    res.status(200).json({ message: "Product trace details removed." });
  } catch (err) {
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ message: "No trace details saved for that product." });
    }
    throw err;
  }
};
