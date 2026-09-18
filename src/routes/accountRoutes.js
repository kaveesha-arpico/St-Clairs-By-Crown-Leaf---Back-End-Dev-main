const express = require("express");
const { getMyOrders } = require("../controllers/accountController");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// Signed-in customer's own account views. Mounted AFTER the global `protect`
// gate in app.js, so req.user is guaranteed set and every query is scoped to
// req.user.email. Profile name/email is served by GET /api/auth/me (read-only).
router.get("/account/orders", asyncHandler(getMyOrders));

module.exports = router;
