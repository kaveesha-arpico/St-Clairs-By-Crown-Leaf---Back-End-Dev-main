// src/controllers/orderController.js
const prisma = require("../config/prisma");

// CREATE order
exports.createOrder = async (req, res) => {
  try {
    const { customer_id, order_time, quantity, total } = req.body;
    const created = await prisma.orders.create({
      data: {
        customer_id,
        order_time: order_time ? new Date(order_time) : undefined,
        quantity,
        total,
      },
      select: { order_id: true },
    });
    res.status(201).json({ order_id: created.order_id, customer_id, order_time, quantity, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating order' });
  }
};

// GET all orders
exports.getAllOrders = async (req, res) => {
  try {
    const rows = await prisma.orders.findMany();
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching orders' });
  }
};

// GET order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await prisma.orders.findUnique({ where: { order_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching order' });
  }
};

// UPDATE order
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_time, quantity, total } = req.body;
    await prisma.orders.update({
      where: { order_id: Number(id) },
      data: {
        order_time: order_time ? new Date(order_time) : undefined,
        quantity,
        total,
      },
    });
    res.status(200).json({ message: 'Order updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error updating order' });
  }
};

// DELETE order
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.orders.delete({ where: { order_id: Number(id) } });
    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting order' });
  }
};
