const pool = require('../config/db');

// CREATE a new batch
exports.createBatch = async (req, res) => {
  try {
    const { factory_id, field_id, harvested_date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO batch (factory_id, field_id, harvested_date) VALUES (?, ?, ?)',
      [factory_id, field_id, harvested_date]
    );
    res.status(201).json({
      batch_id: result.insertId,
      factory_id,
      field_id,
      harvested_date
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating batch' });
  }
};

// READ all batches
exports.getAllBatches = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM batch');
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
    const [rows] = await pool.query('SELECT * FROM batch WHERE batch_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.status(200).json(rows[0]);
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
    const [result] = await pool.query(
      'UPDATE batch SET factory_id = ?, field_id = ?, harvested_date = ? WHERE batch_id = ?',
      [factory_id, field_id, harvested_date, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.status(200).json({ message: 'Batch updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating batch' });
  }
};

// DELETE a batch
exports.deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM batch WHERE batch_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.status(200).json({ message: 'Batch deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting batch' });
  }
};