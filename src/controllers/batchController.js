const prisma = require('../config/prisma');

// CREATE a new batch
exports.createBatch = async (req, res) => {
  try {
    const { factory_id, field_id, harvested_date } = req.body;
    const created = await prisma.batch.create({
      data: {
        factory_id,
        field_id,
        harvested_date: harvested_date ? new Date(harvested_date) : undefined,
      },
      select: { batch_id: true },
    });
    res.status(201).json({ batch_id: created.batch_id, factory_id, field_id, harvested_date });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid factory_id or field_id: a referenced record does not exist.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error creating batch' });
  }
};

// READ all batches
exports.getAllBatches = async (req, res) => {
  try {
    const rows = await prisma.batch.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching batches' });
  }
};

// READ one batch by id
exports.getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.batch.findUnique({ where: { batch_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching batch' });
  }
};

// UPDATE a batch
exports.updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { factory_id, field_id, harvested_date } = req.body;
    await prisma.batch.update({
      where: { batch_id: Number(id) },
      data: {
        factory_id,
        field_id,
        harvested_date: harvested_date ? new Date(harvested_date) : undefined,
      },
    });
    res.status(200).json({ message: 'Batch updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Batch not found' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid factory_id or field_id: a referenced record does not exist.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating batch' });
  }
};

// DELETE a batch
exports.deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.batch.delete({ where: { batch_id: Number(id) } });
    res.status(200).json({ message: 'Batch deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Batch not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting batch' });
  }
};
