// estateController.js
// Admin CRUD for tea estates — "Plantation" on the public trace page.
// Every route here is behind protect + requireStaff (see routes/adminRoutes.js).

const prisma = require("../config/prisma");

// GET /api/admin/estates?include_inactive=true
exports.listEstates = async (req, res) => {
  const where =
    req.query.include_inactive === "true" ? {} : { is_active: true };

  const estates = await prisma.estates.findMany({
    where,
    orderBy: { name: "asc" },
  });
  res.status(200).json(estates);
};

// GET /api/admin/estates/:id
exports.getEstate = async (req, res) => {
  const estate = await prisma.estates.findUnique({
    where: { estate_id: Number(req.params.id) },
  });
  if (!estate) {
    return res.status(404).json({ message: "Estate not found." });
  }
  res.status(200).json(estate);
};

// POST /api/admin/estates
exports.createEstate = async (req, res) => {
  const { name, region } = req.body;
  try {
    const created = await prisma.estates.create({
      data: { name, region: region ?? null },
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "An estate with that name already exists." });
    }
    throw err;
  }
};

// PUT /api/admin/estates/:id
exports.updateEstate = async (req, res) => {
  const { name, region, is_active } = req.body;
  try {
    const updated = await prisma.estates.update({
      where: { estate_id: Number(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(region !== undefined && { region }),
        ...(is_active !== undefined && { is_active }),
      },
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Estate not found." });
    }
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "An estate with that name already exists." });
    }
    throw err;
  }
};

// DELETE /api/admin/estates/:id
//
// Deactivates rather than deletes. A trace page for tea already in a customer's
// hands has to keep resolving its estate forever, so an estate that has ever
// been used must never disappear — the database would refuse the delete anyway
// (lots.estate_id is ON DELETE RESTRICT). Deactivating just hides it from the
// pickers staff use when entering new lots.
exports.deactivateEstate = async (req, res) => {
  try {
    const updated = await prisma.estates.update({
      where: { estate_id: Number(req.params.id) },
      data: { is_active: false },
    });
    res
      .status(200)
      .json({ message: "Estate deactivated.", estate: updated });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Estate not found." });
    }
    throw err;
  }
};
