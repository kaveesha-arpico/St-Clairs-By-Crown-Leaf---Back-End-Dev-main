const express = require("express");
const {
  getMachineOrders,
  postMachineOrderStatus,
} = require("../controllers/machineController");
const asyncHandler = require("../middleware/asyncHandler");
const machineAuth = require("../middleware/machineAuth");

const router = express.Router();

// Tea-dispensing machine endpoints. Authenticated by their own API key
// (machineAuth), not JWT — so they sit above the global auth gate.
// Read: poll the order feed.
router.get("/machine/orders", machineAuth, asyncHandler(getMachineOrders));
// Write-back: the machine reports an order's status (append-only, idempotent).
router.post(
  "/machine/orders/status",
  machineAuth,
  asyncHandler(postMachineOrderStatus)
);

module.exports = router;
