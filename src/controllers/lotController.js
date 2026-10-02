// lotController.js
// Admin CRUD for manufactured lots — the record that carries provenance.
// A lot ties an estate and a factory together; pack runs then draw from it.
// Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");

// Estate + factory names are what staff actually read in the admin list; the
// raw ids are meaningless on screen.
const WITH_ORIGIN = {
  estate: { select: { estate_id: true, name: true, region: true } },
  factory: { select: { factory_id: true, name: true } },
};

// GET /api/admin/lots?grade=Golden%20Tips&estate_id=1
exports.listLots = async (req, res) => {
  const { grade, estate_id } = req.query;

  const lots = await prisma.lots.findMany({
    where: {
      ...(grade && { grade }),
      ...(estate_id && { estate_id: Number(estate_id) }),
    },
    include: WITH_ORIGIN,
    orderBy: { lot_id: "desc" },
  });
  res.status(200).json(lots);
};

// GET /api/admin/lots/:id
exports.getLot = async (req, res) => {
  const lot = await prisma.lots.findUnique({
    where: { lot_id: Number(req.params.id) },
    include: {
      ...WITH_ORIGIN,
      pack_runs: {
        select: {
          pack_run_id: true,
          pack_run_code: true,
          packed_date: true,
          quantity_packed: true,
        },
        orderBy: { packed_date: "desc" },
      },
    },
  });
  if (!lot) {
    return res.status(404).json({ message: "Lot not found." });
  }
  res.status(200).json(lot);
};

// POST /api/admin/lots
exports.createLot = async (req, res) => {
  const { lot_number, estate_id, factory_id, grade } = req.body;
  try {
    const created = await prisma.lots.create({
      data: {
        lot_number,
        estate_id: Number(estate_id),
        factory_id: Number(factory_id),
        grade: grade ?? null,
      },
      include: WITH_ORIGIN,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A lot with that number already exists." });
    }
    if (err.code === "P2003") {
      return res
        .status(400)
        .json({ message: "Unknown estate_id or factory_id." });
    }
    throw err;
  }
};

// PUT /api/admin/lots/:id
exports.updateLot = async (req, res) => {
  const { lot_number, estate_id, factory_id, grade } = req.body;
  try {
    const updated = await prisma.lots.update({
      where: { lot_id: Number(req.params.id) },
      data: {
        ...(lot_number !== undefined && { lot_number }),
        ...(estate_id !== undefined && { estate_id: Number(estate_id) }),
        ...(factory_id !== undefined && { factory_id: Number(factory_id) }),
        ...(grade !== undefined && { grade }),
      },
      include: WITH_ORIGIN,
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Lot not found." });
    }
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A lot with that number already exists." });
    }
    if (err.code === "P2003") {
      return res
        .status(400)
        .json({ message: "Unknown estate_id or factory_id." });
    }
    throw err;
  }
};

// DELETE /api/admin/lots/:id
//
// A real delete, unlike estates/factories — a lot entered by mistake before any
// tea is packed from it is just a typo and should be removable. Once a pack run
// references it the database refuses (pack_runs.lot_id is ON DELETE RESTRICT),
// which we surface as 409 rather than a 500: the tea has left the building and
// its provenance must stay resolvable.
exports.deleteLot = async (req, res) => {
  try {
    await prisma.lots.delete({ where: { lot_id: Number(req.params.id) } });
    res.status(200).json({ message: "Lot deleted." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Lot not found." });
    }
    if (err.code === "P2003") {
      return res.status(409).json({
        message:
          "This lot already has pack runs and cannot be deleted. Correct the lot instead.",
      });
    }
    throw err;
  }
};
