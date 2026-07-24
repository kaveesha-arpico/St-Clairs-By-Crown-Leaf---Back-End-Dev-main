const express = require("express");
const { getAllOrders } = require("../controllers/shopifyOrderController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Lists all Shopify orders (customer PII) — admin only, JWT required.
router.get("/get-all-orders", protect, getAllOrders);
module.exports = router;
