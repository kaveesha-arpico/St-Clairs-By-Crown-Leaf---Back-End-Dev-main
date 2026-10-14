// packRunController.js
// Admin CRUD for packing runs — one batch of retail units packed on one day,
// drawn from exactly one lot. Supplies "Packed Date" on the public trace page.
//
// Creating a run MINTS ITS TRACE CODES: one per unit packed, so every jar has
// an identity (and a printable QR) before any order exists. The codes are what
// the packer later scans to link a jar to an order line.
//
// Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");
const { packRunDates } = require("../lib/dates");
const { mintCodes, MAX_CODES_PER_MINT } = require("../lib/traceCodeStore");

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

function qrUrl(code) {
  return `/api/qr/${code}.png`;
}

// GET /api/admin/pack-runs?lot_id=3&sku=GT-100
exports.listPackRuns = async (req, res) => {
  const { lot_id, sku } = req.query;

  const runs = await prisma.pack_runs.findMany({
    where: {
      ...(lot_id && { lot_id: Number(lot_id) }),
      ...(sku && { sku }),
    },
    include: {
      ...WITH_LOT,
      _count: { select: { trace_codes: true } },
    },
    orderBy: { packed_date: "desc" },
  });

  res.status(200).json(
    runs.map((run) => {
      const { _count, ...rest } = run;
      return { ...packRunDates(rest), codes_count: _count.trace_codes };
    })
  );
};

// GET /api/admin/pack-runs/:id
exports.getPackRun = async (req, res) => {
  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_id: Number(req.params.id) },
    include: { ...WITH_LOT, _count: { select: { trace_codes: true } } },
  });
  if (!run) {
    return res.status(404).json({ message: "Pack run not found." });
  }
  const { _count, ...rest } = run;
  res.status(200).json({ ...packRunDates(rest), codes_count: _count.trace_codes });
};

// GET /api/admin/pack-runs/by-code/:code
// Looks a run up by its human identifier. Note the packer no longer scans this
// to pack an order — they scan the JAR's trace code — but it is still how a run
// is found on the admin screens and printed on the outer case.
exports.getPackRunByCode = async (req, res) => {
  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_code: req.params.code },
    include: { ...WITH_LOT, _count: { select: { trace_codes: true } } },
  });
  if (!run) {
    return res.status(404).json({ message: "No pack run with that code." });
  }
  const { _count, ...rest } = run;
  res.status(200).json({ ...packRunDates(rest), codes_count: _count.trace_codes });
};

// POST /api/admin/pack-runs
// Creates the run AND its trace codes, one per unit, in a single transaction —
// a run without codes would be a batch of jars with no labels, so the two are
// never allowed to exist separately.
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
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.pack_runs.create({
        data: {
          pack_run_code,
          lot_id: Number(lot_id),
          packed_date: new Date(packed_date),
          // Shopify ids stay strings end to end — they exceed JS Number's safe
          // range, so Number()/BigInt() here would round the trailing digits.
          shopify_product_id:
            shopify_product_id != null ? String(shopify_product_id) : null,
          sku: sku ?? null,
          quantity_packed: Number(quantity_packed),
        },
        include: WITH_LOT,
      });

      const codes = await mintCodes(created.pack_run_id, Number(quantity_packed), tx);
      return { run: created, codes };
    });

    res.status(201).json({
      ...packRunDates(result.run),
      codes_count: result.codes.length,
      codes_created: result.codes.length,
    });
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
// Note quantity_packed is NOT editable here: it is the number of codes minted
// at creation, and changing the number without changing the codes would lie.
// To record more jars than planned, mint more with POST /:id/codes.
exports.updatePackRun = async (req, res) => {
  const { pack_run_code, lot_id, packed_date, shopify_product_id, sku } =
    req.body;

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
      },
      include: { ...WITH_LOT, _count: { select: { trace_codes: true } } },
    });
    const { _count, ...rest } = updated;
    res.status(200).json({ ...packRunDates(rest), codes_count: _count.trace_codes });
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
//
// Allowed only while, as far as we can tell, no label from this run is in the
// world: no code scanned, none linked to an order. A run entered by mistake
// and never printed is just a typo and should be removable (the codes go with
// it, by cascade). Past that point the run stays and individual codes are
// revoked instead — deleting it would orphan jars people are holding.
exports.deletePackRun = async (req, res) => {
  const packRunId = Number(req.params.id);

  const inUse = await prisma.trace_codes.count({
    where: {
      pack_run_id: packRunId,
      OR: [{ scan_count: { gt: 0 } }, { line_item_id: { not: null } }],
    },
  });
  if (inUse > 0) {
    return res.status(409).json({
      message:
        `${inUse} code(s) from this pack run have been scanned or packed into orders, ` +
        `so it cannot be deleted. Revoke individual codes instead.`,
    });
  }

  try {
    await prisma.pack_runs.delete({ where: { pack_run_id: packRunId } });
    res.status(200).json({ message: "Pack run and its unused codes deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Pack run not found." });
    }
    throw err;
  }
};

// GET /api/admin/pack-runs/:id/codes
// Every code on the run, with where each jar ended up. This is what the label
// printing screen and the "where did this batch go" view both read.
exports.listCodes = async (req, res) => {
  const packRunId = Number(req.params.id);

  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_id: packRunId },
    select: { pack_run_id: true, pack_run_code: true },
  });
  if (!run) {
    return res.status(404).json({ message: "Pack run not found." });
  }

  const codes = await prisma.trace_codes.findMany({
    where: { pack_run_id: packRunId },
    orderBy: { created_at: "asc" },
    select: {
      code: true,
      status: true,
      scan_count: true,
      first_scanned_at: true,
      allocated_at: true,
      mismatch_override: true,
      line_item_id: true,
      line_item: {
        select: { order: { select: { order_number: true } } },
      },
    },
  });

  res.status(200).json({
    pack_run_id: run.pack_run_id,
    pack_run_code: run.pack_run_code,
    count: codes.length,
    codes: codes.map((c) => ({
      code: c.code,
      status: c.status,
      scan_count: c.scan_count,
      first_scanned_at: c.first_scanned_at,
      qr_url: qrUrl(c.code),
      line_item_id: c.line_item_id,
      order_number: c.line_item ? c.line_item.order.order_number : null,
      allocated_at: c.allocated_at,
      mismatch_override: c.mismatch_override,
    })),
  });
};

// POST /api/admin/pack-runs/:id/codes   { count }
// Mint more codes onto an existing run — "we planned 48 and packed 60". Returns
// only the new codes, so the caller can print just those labels.
exports.addCodes = async (req, res) => {
  const packRunId = Number(req.params.id);
  const count = Number(req.body.count);

  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_id: packRunId },
    select: { pack_run_id: true, quantity_packed: true },
  });
  if (!run) {
    return res.status(404).json({ message: "Pack run not found." });
  }

  const result = await prisma.$transaction(async (tx) => {
    const codes = await mintCodes(packRunId, count, tx);
    // Keep quantity_packed honest: it is "how many units exist", and that just
    // went up.
    await tx.pack_runs.update({
      where: { pack_run_id: packRunId },
      data: { quantity_packed: (run.quantity_packed || 0) + codes.length },
    });
    return codes;
  });

  res.status(201).json({
    pack_run_id: packRunId,
    codes_created: result.length,
    codes: result.map((code) => ({ code, qr_url: qrUrl(code) })),
  });
};

exports.MAX_CODES_PER_MINT = MAX_CODES_PER_MINT;
