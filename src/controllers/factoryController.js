// factoryController.js
// Admin CRUD for tea factories — "Factory" on the public trace page.
// Every route here is behind protect + requireStaff (see routes/adminRoutes.js).
//
// NOTE: this replaces an identically-named controller for the old, unused
// `factory` table, which was dropped in 20261002010000_drop_legacy_supply_chain.

const prisma = require("../config/prisma");

// GET /api/admin/factories?include_inactive=true
exports.listFactories = async (req, res) => {
  const where =
    req.query.include_inactive === "true" ? {} : { is_active: true };

  const factories = await prisma.factories.findMany({
    where,
    orderBy: { name: "asc" },
  });
  res.status(200).json(factories);
};

// GET /api/admin/factories/:id
exports.getFactory = async (req, res) => {
  const factory = await prisma.factories.findUnique({
    where: { factory_id: Number(req.params.id) },
  });
  if (!factory) {
    return res.status(404).json({ message: "Factory not found." });
  }
  res.status(200).json(factory);
};

// POST /api/admin/factories
exports.createFactory = async (req, res) => {
  try {
    const created = await prisma.factories.create({
      data: { name: req.body.name },
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A factory with that name already exists." });
    }
    throw err;
  }
};

// PUT /api/admin/factories/:id
exports.updateFactory = async (req, res) => {
  const { name, is_active } = req.body;
  try {
    const updated = await prisma.factories.update({
      where: { factory_id: Number(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(is_active !== undefined && { is_active }),
      },
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Factory not found." });
    }
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "A factory with that name already exists." });
    }
    throw err;
  }
};

// DELETE /api/admin/factories/:id
// Deactivates rather than deletes — same reasoning as estates: a shipped trace
// page must keep resolving its factory forever.
exports.deactivateFactory = async (req, res) => {
  try {
    const updated = await prisma.factories.update({
      where: { factory_id: Number(req.params.id) },
      data: { is_active: false },
    });
    res
      .status(200)
      .json({ message: "Factory deactivated.", factory: updated });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Factory not found." });
    }
    throw err;
  }
};
