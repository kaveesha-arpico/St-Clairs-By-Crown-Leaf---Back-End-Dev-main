const express = require("express");
const { getMyOrders, reorder } = require("../controllers/accountController");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// Signed-in customer's own account views. Mounted AFTER the global `protect`
// gate in app.js, so req.user is guaranteed set and every query is scoped to
// req.user.email. Profile name/email is served by GET /api/auth/me (read-only).
router.get("/account/orders", asyncHandler(getMyOrders));
// Rebuild a Shopify cart from a past order and return a checkout URL.
router.post("/account/orders/:id/reorder", asyncHandler(reorder));

module.exports = router;
