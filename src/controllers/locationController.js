const pool = require('../config/db');

//CRUD operation for Location
// CREATE a new location
exports.createLocation = async (req, res) => {
  try {
    const { location_name, other_info } = req.body;
    const [result] = await pool.query(
      'INSERT INTO location (location_name, other_info) VALUES (?, ?)',
      [location_name, other_info]
    );
    res.status(201).json({
      location_id: result.insertId,
      location_name,
      other_info
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating location' });
  }
};

// READ all locations
exports.getAllLocations = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM location');
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching locations' });
  }
};

// READ one location by id
exports.getLocationById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM location WHERE location_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching location' });
  }
};

// UPDATE a location
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { location_name, other_info } = req.body;
    const [result] = await pool.query(
      'UPDATE location SET location_name = ?, other_info = ? WHERE location_id = ?',
      [location_name, other_info, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(200).json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating location' });
  }
};

// DELETE a location
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM location WHERE location_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(200).json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting location' });
  }
};