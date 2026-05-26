
const pool = require('../config/db');

// CRUD Operations for Factory
// CREATE a new factory
exports.createFactory = async (req, res) => {
  try {
    const { factory_name, other_info } = req.body;
    const [result] = await pool.query(
      'INSERT INTO factory (factory_name, other_info) VALUES (?, ?)',
      [factory_name, other_info]
    );
    res.status(201).json({
      factory_id: result.insertId,
      factory_name,
      other_info
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating factory' });
  }
};

// READ all factories
exports.getAllFactories = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM factory');
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
    const [rows] = await pool.query('SELECT * FROM factory WHERE factory_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Factory not found' });
    }
    res.status(200).json(rows[0]);
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
    const [result] = await pool.query(
      'UPDATE factory SET factory_name = ?, other_info = ? WHERE factory_id = ?',
      [factory_name, other_info, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Factory not found' });
    }
    res.status(200).json({ message: 'Factory updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating factory' });
  }
};

// DELETE a factory
exports.deleteFactory = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM factory WHERE factory_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Factory not found' });
    }
    res.status(200).json({ message: 'Factory deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting factory' });
  }
};
