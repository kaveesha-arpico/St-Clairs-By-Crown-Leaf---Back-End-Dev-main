const prisma = require('../config/prisma');

//CRUD operations for Fields

// CREATE a new field
exports.createField = async (req, res) => {
  try {
    const { plantation_id, field_information } = req.body;
    const created = await prisma.field.create({
      data: { plantation_id, field_information },
      select: { field_id: true },
    });
    res.status(201).json({ field_id: created.field_id, plantation_id, field_information });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating field' });
  }
};

// READ all fields
exports.getAllFields = async (req, res) => {
  try {
    const rows = await prisma.field.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching fields' });
  }
};

// READ one field by id
exports.getFieldById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.field.findUnique({ where: { field_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching field' });
  }
};

// UPDATE a field
exports.updateField = async (req, res) => {
  try {
    const { id } = req.params;
    const { plantation_id, field_information } = req.body;
    await prisma.field.update({
      where: { field_id: Number(id) },
      data: { plantation_id, field_information },
    });
    res.status(200).json({ message: 'Field updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Field not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating field' });
  }
};

// DELETE a field
exports.deleteField = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.field.delete({ where: { field_id: Number(id) } });
    res.status(200).json({ message: 'Field deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Field not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting field' });
  }
};
