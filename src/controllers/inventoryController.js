const prisma = require('../config/prisma');

// CREATE a new inventory record
exports.createInventory = async (req, res) => {
  try {
    const { location_id, batch_id, quantity } = req.body;
    const created = await prisma.inventory.create({
      data: { location_id, batch_id, quantity },
      select: { inventory_id: true },
    });
    res.status(201).json({ inventory_id: created.inventory_id, location_id, batch_id, quantity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating inventory' });
  }
};

// READ all inventory records
exports.getAllInventories = async (req, res) => {
  try {
    const rows = await prisma.inventory.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching inventory records' });
  }
};

// READ one inventory record by id
exports.getInventoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.inventory.findUnique({ where: { inventory_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching inventory record' });
  }
};

// UPDATE an inventory record
exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const { location_id, batch_id, quantity } = req.body;
    await prisma.inventory.update({
      where: { inventory_id: Number(id) },
      data: { location_id, batch_id, quantity },
    });
    res.status(200).json({ message: 'Inventory updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating inventory' });
  }
};

// DELETE an inventory record
exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.inventory.delete({ where: { inventory_id: Number(id) } });
    res.status(200).json({ message: 'Inventory deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting inventory' });
  }
};
