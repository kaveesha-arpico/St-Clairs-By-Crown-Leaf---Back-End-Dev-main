const express = require("express");
const {
  getMachineOrders,
  postMachineOrderStatus,
} = require("../controllers/machineController");
const {
  getPendingOrders,
  getChanges,
  postStatus,
} = require("../controllers/machineOrdersController");
const { postTraceability } = require("../controllers/machineTraceController");
const asyncHandler = require("../middleware/asyncHandler");
const machineAuth = require("../middleware/machineAuth");
const { machineLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// TeaMatrix machine API. Authenticated by its own API key (+ optional IP
// allowlist) in machineAuth, not JWT — so this router sits above the global
// auth gate AND above the global rate limiter in app.js: the machine polls two
// endpoints every 15 s, which alone exceeds the 300/15 min public limit, so it
// gets its own, more generous limiter here (spec v1.1 §6.3).
router.use("/machine", machineLimiter, machineAuth);

// ---- Spec v1.1 (§7): machine_orders, one row per custom-blend line ----
router.get("/machine/orders/pending", asyncHandler(getPendingOrders));
router.get("/machine/orders/changes", asyncHandler(getChanges));
router.post("/machine/orders/:id/status", asyncHandler(postStatus));
// Addendum 2: one trace link per bottle, posted after the bottle is made.
router.post("/machine/orders/:id/traceability", asyncHandler(postTraceability));

// ---- Legacy (v1.0): whole-order feed + per-order status ----
// Kept until the machine has cut over to the §7 endpoints, then removed along
// with machine_order_statuses (spec §10 step 8). Nothing polls these today.
router.get("/machine/orders", asyncHandler(getMachineOrders));
router.post("/machine/orders/status", asyncHandler(postMachineOrderStatus));

module.exports = router;
