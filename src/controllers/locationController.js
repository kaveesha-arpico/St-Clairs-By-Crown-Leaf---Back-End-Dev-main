const prisma = require('../config/prisma');

// CREATE a new location
exports.createLocation = async (req, res) => {
  try {
    const { location_name, other_info } = req.body;
    const created = await prisma.location.create({
      data: { location_name, other_info },
      select: { location_id: true },
    });
    res.status(201).json({ location_id: created.location_id, location_name, other_info });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating location' });
  }
};

// READ all locations
exports.getAllLocations = async (req, res) => {
  try {
    const rows = await prisma.location.findMany();
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
    const row = await prisma.location.findUnique({ where: { location_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.status(200).json(row);
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
    await prisma.location.update({
      where: { location_id: Number(id) },
      data: { location_name, other_info },
    });
    res.status(200).json({ message: 'Location updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Location not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating location' });
  }
};

// DELETE a location
exports.deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.location.delete({ where: { location_id: Number(id) } });
    res.status(200).json({ message: 'Location deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Location not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting location' });
  }
};
