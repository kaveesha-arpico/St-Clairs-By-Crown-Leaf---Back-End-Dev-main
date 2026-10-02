// packRunController.js
// Admin CRUD for packing runs — one batch of retail units packed on one day,
// drawn from exactly one lot. Supplies "Packed Date" on the public trace page,
// and `pack_run_code` is what staff scan when packing an order.
// Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");

// The full origin chain, which is what the admin list needs to display:
// pack run -> lot -> estate + factory.
const WITH_LOT = {
  lot: {
    include: {
      estate: { select: { estate_id: true, name: true, region: true } },
      factory: { select: { factory_id: true, name: true } },
    },
  },
};

// GET /api/admin/pack-runs?lot_id=3&sku=GT-100
exports.listPackRuns = async (req, res) => {
  const { lot_id, sku } = req.query;

  const runs = await prisma.pack_runs.findMany({
    where: {
      ...(lot_id && { lot_id: Number(lot_id) }),
      ...(sku && { sku }),
    },
    include: WITH_LOT,
    orderBy: { packed_date: "desc" },
  });
  res.status(200).json(runs);
};

// GET /api/admin/pack-runs/:id
exports.getPackRun = async (req, res) => {
  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_id: Number(req.params.id) },
    include: WITH_LOT,
  });
  if (!run) {
    return res.status(404).json({ message: "Pack run not found." });
  }
  res.status(200).json(run);
};

// GET /api/admin/pack-runs/by-code/:code
// What the packing screen calls when a barcode is scanned, to show the operator
// what they just picked up before committing it to an order.
exports.getPackRunByCode = async (req, res) => {
  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_code: req.params.code },
    include: WITH_LOT,
  });
  if (!run) {
    return res.status(404).json({ message: "No pack run with that code." });
  }
  res.status(200).json(run);
};

// POST /api/admin/pack-runs
exports.createPackRun = async (req, res) => {
  const {
    pack_run_code,
    lot_id,
    packed_date,
    shopify_product_id,
    sku,
    quantity_packed,
  } = req.body;

  try {
    const created = await prisma.pack_runs.create({
      data: {
        pack_run_code,
        lot_id: Number(lot_id),
        packed_date: new Date(packed_date),
        // Shopify ids stay strings end to end — they exceed JS Number's safe
        // range, so Number()/BigInt() here would round the trailing digits.
        shopify_product_id:
          shopify_product_id != null ? String(shopify_product_id) : null,
        sku: sku ?? null,
        quantity_packed:
          quantity_packed != null ? Number(quantity_packed) : null,
      },
      include: WITH_LOT,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A pack run with that code already exists." });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ message: "Unknown lot_id." });
    }
    throw err;
  }
};

// PUT /api/admin/pack-runs/:id
exports.updatePackRun = async (req, res) => {
  const {
    pack_run_code,
    lot_id,
    packed_date,
    shopify_product_id,
    sku,
    quantity_packed,
  } = req.body;

  try {
    const updated = await prisma.pack_runs.update({
      where: { pack_run_id: Number(req.params.id) },
      data: {
        ...(pack_run_code !== undefined && { pack_run_code }),
        ...(lot_id !== undefined && { lot_id: Number(lot_id) }),
        ...(packed_date !== undefined && {
          packed_date: new Date(packed_date),
        }),
        ...(shopify_product_id !== undefined && {
          shopify_product_id:
            shopify_product_id != null ? String(shopify_product_id) : null,
        }),
        ...(sku !== undefined && { sku }),
        ...(quantity_packed !== undefined && {
          quantity_packed:
            quantity_packed != null ? Number(quantity_packed) : null,
        }),
      },
      include: WITH_LOT,
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Pack run not found." });
    }
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A pack run with that code already exists." });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ message: "Unknown lot_id." });
    }
    throw err;
  }
};

// DELETE /api/admin/pack-runs/:id
// Removable only until it has been allocated to an order. After that the
// database refuses (order_allocations.pack_run_id is ON DELETE RESTRICT),
// because deleting it would erase the provenance of tea already shipped.
exports.deletePackRun = async (req, res) => {
  try {
    await prisma.pack_runs.delete({
      where: { pack_run_id: Number(req.params.id) },
    });
    res.status(200).json({ message: "Pack run deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Pack run not found." });
    }
    if (err.code === "P2003") {
      return res.status(409).json({
        message:
          "This pack run is already allocated to an order and cannot be deleted.",
      });
    }
    throw err;
  }
};
