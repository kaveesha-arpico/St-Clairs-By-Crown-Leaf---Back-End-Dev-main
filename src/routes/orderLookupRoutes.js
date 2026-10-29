const express = require("express");
const { lookupOrder } = require("../controllers/accountController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { lookupLimiter } = require("../middleware/rateLimiter");
const { orderLookup } = require("../validators/schemas");

const router = express.Router();

// Guest order tracking: PUBLIC (mounted above the JWT gate in app.js). The
// (order_number, email) pair is the proof of ownership; see lookupOrder for the
// anti-probing rules. Note the path shares the /api/orders prefix with the
// staff-only CRUD router — this route answers first, so the staff gate below
// never sees a matching request; anything else under /api/orders still does.
router.post(
  "/orders/lookup",
  lookupLimiter,
  validate(orderLookup.lookup),
  asyncHandler(lookupOrder)
);

module.exports = router;
