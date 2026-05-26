// src/controllers/orderController.js
const pool = require('../config/db');

// CREATE order
exports.createOrder = async (req, res) => {
  try {
    const { customer_id, order_time, quantity, total } = req.body;
    const [result] = await pool.query(
      `INSERT INTO orders (customer_id, order_time, quantity, total) 
       VALUES (?, ?, ?, ?)`,
      [customer_id, order_time, quantity, total]
    );
    res.status(201).json({ order_id: result.insertId, customer_id, order_time, quantity, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating order' });
  }
};

// GET all orders
exports.getAllOrders = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders');
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
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json(rows[0]);
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
    const [result] = await pool.query(
      `UPDATE orders 
       SET order_time = ?, quantity = ?, total = ?
       WHERE order_id = ?`,
      [order_time, quantity, total, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating order' });
  }
};

// DELETE order
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM orders WHERE order_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting order' });
  }
};
