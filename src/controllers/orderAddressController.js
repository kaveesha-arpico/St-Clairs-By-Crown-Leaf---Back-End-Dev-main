const prisma = require("../config/prisma");

//Link order to address
exports.addOrderAddress = async (req, res) => {
  try {
    const { order_id, address_id } = req.body;
    await prisma.order_addresses.create({ data: { order_id, address_id } });
    res.status(201).json({ message: 'Address linked to order successfully' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid order_id or address_id: a referenced record does not exist.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error linking address to order' });
  }
};

//Get All addresses for an order
exports.getAddressesForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const links = await prisma.order_addresses.findMany({
      where: { order_id: Number(orderId) },
      include: { addresses: true },
    });
    const rows = links.map((link) => link.addresses);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching order addresses' });
  }
};

//UNLINK an address from an order
exports.removeOrderAddress = async (req, res) => {
  try {
    const { orderId, addressId } = req.params;
    await prisma.order_addresses.delete({
      where: {
        order_id_address_id: {
          order_id: Number(orderId),
          address_id: Number(addressId),
        },
      },
    });
    res.status(200).json({ message: 'Addresses unlinked from order successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order-address link not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error removing order address' });
  }
};
