// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder
} = require('../controllers/orderController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { order } = require('../validators/schemas');

router.post('/orders', validate(order.create), asyncHandler(createOrder));
router.get('/orders', asyncHandler(getAllOrders));
router.get('/orders/:id', validate(order.idParam), asyncHandler(getOrderById));
router.put('/orders/:id', validate([...order.idParam, ...order.update]), asyncHandler(updateOrder));
router.delete('/orders/:id', validate(order.idParam), asyncHandler(deleteOrder));

module.exports = router;
