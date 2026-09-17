const express = require("express");
const { getMachineOrders } = require("../controllers/machineController");
const asyncHandler = require("../middleware/asyncHandler");
const machineAuth = require("../middleware/machineAuth");

const router = express.Router();

// Read-only order feed for the tea-dispensing machine. Authenticated by its own
// API key (machineAuth), not JWT — so it sits above the global auth gate.
router.get("/machine/orders", machineAuth, asyncHandler(getMachineOrders));

module.exports = router;
