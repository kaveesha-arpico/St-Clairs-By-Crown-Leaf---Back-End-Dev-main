const express = require("express");
const { getAllOrders } = require("../controllers/shopifyOrderController");
const { protect } = require("../middleware/authMiddleware");
const { requireStaff } = require("../middleware/requireStaff");

const router = express.Router();

// Lists all Shopify orders (customer PII) — staff only. This router is mounted
// above the global auth gate, so both checks are explicit here.
router.get("/get-all-orders", protect, requireStaff, getAllOrders);
module.exports = router;
