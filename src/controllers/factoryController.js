const prisma = require('../config/prisma');

// CRUD Operations for Factory
// CREATE a new factory
exports.createFactory = async (req, res) => {
  try {
    const { factory_name, other_info } = req.body;
    const created = await prisma.factory.create({
      data: { factory_name, other_info },
      select: { factory_id: true },
    });
    res.status(201).json({ factory_id: created.factory_id, factory_name, other_info });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating factory' });
  }
};

// READ all factories
exports.getAllFactories = async (req, res) => {
  try {
    const rows = await prisma.factory.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching factories' });
  }
};

// READ one factory by id
exports.getFactoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.factory.findUnique({ where: { factory_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Factory not found' });
    }
    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching factory' });
  }
};

// UPDATE a factory
exports.updateFactory = async (req, res) => {
  try {
    const { id } = req.params;
    const { factory_name, other_info } = req.body;
    await prisma.factory.update({
      where: { factory_id: Number(id) },
      data: { factory_name, other_info },
    });
    res.status(200).json({ message: 'Factory updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Factory not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating factory' });
  }
};

// DELETE a factory
exports.deleteFactory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.factory.delete({ where: { factory_id: Number(id) } });
    res.status(200).json({ message: 'Factory deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Factory not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting factory' });
  }
};
