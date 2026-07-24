const prisma = require("../config/prisma");

//CRUD Operations for Addresses
//CREATE address
exports.createAddress = async (req, res) => {
  try {
    const { customer_id, street, city, state, zip_code, country, is_default } = req.body;
    const created = await prisma.addresses.create({
      data: {
        customer_id,
        street,
        city,
        state,
        zip_code,
        country,
        is_default: is_default || false,
      },
      select: { address_id: true },
    });
    res.status(201).json({ address_id: created.address_id, customer_id, street, city });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid customer_id: the referenced customer does not exist.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error creating address' });
  }
};

// GET all addresses
exports.getAllAddresses = async (req, res) => {
  try {
    const rows = await prisma.addresses.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching addresses' });
  }
};

//Get addresses by Customer
exports.getAddressesByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const rows = await prisma.addresses.findMany({ where: { customer_id: Number(customerId) } });
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching addresses' });
  }
};

//Update address
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { street, city, state, zip_code, country, is_default } = req.body;
    await prisma.addresses.update({
      where: { address_id: Number(id) },
      data: { street, city, state, zip_code, country, is_default },
    });
    res.status(200).json({ message: 'Address updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Address Not Found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating address' });
  }
};

//Delete address
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.addresses.delete({ where: { address_id: Number(id) } });
    res.status(200).json({ message: 'Address Deleted Successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Address not Found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting address' });
  }
};
