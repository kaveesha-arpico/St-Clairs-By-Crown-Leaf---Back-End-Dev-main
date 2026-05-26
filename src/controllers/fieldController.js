
const pool = require('../config/db');

//CRUD operations for Fields

// CREATE a new field
exports.createField = async (req, res) => {
  try {
    const { plantation_id, field_information } = req.body;
    const [result] = await pool.query(
      'INSERT INTO field (plantation_id, field_information) VALUES (?, ?)',
      [plantation_id, field_information]
    );
    res.status(201).json({
      field_id: result.insertId,
      plantation_id,
      field_information
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating field' });
  }
};

// READ all fields
exports.getAllFields = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM field');
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
    const [rows] = await pool.query('SELECT * FROM field WHERE field_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.status(200).json(rows[0]);
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
    const [result] = await pool.query(
      'UPDATE field SET plantation_id = ?, field_information = ? WHERE field_id = ?',
      [plantation_id, field_information, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.status(200).json({ message: 'Field updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating field' });
  }
};

// DELETE a field
exports.deleteField = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM field WHERE field_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Field not found' });
    }
    res.status(200).json({ message: 'Field deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting field' });
  }
};
