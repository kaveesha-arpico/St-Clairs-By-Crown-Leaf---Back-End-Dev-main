const pool = require('../config/db');

//CRUD operations for inventory

// CREATE a new inventory record
exports.createInventory = async (req, res) => {
  try {
    const { location_id, batch_id, quantity } = req.body;
    const [result] = await pool.query(
      'INSERT INTO inventory (location_id, batch_id, quantity) VALUES (?, ?, ?)',
      [location_id, batch_id, quantity]
    );
    res.status(201).json({
      inventory_id: result.insertId,
      location_id,
      batch_id,
      quantity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating inventory' });
  }
};

// READ all inventory records
exports.getAllInventories = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inventory');
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
    const [rows] = await pool.query('SELECT * FROM inventory WHERE inventory_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    res.status(200).json(rows[0]);
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
    const [result] = await pool.query(
      'UPDATE inventory SET location_id = ?, batch_id = ?, quantity = ? WHERE inventory_id = ?',
      [location_id, batch_id, quantity, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    res.status(200).json({ message: 'Inventory updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating inventory' });
  }
};

// DELETE an inventory record
exports.deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM inventory WHERE inventory_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
    res.status(200).json({ message: 'Inventory deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting inventory' });
  }
};
