const express = require("express");
const { login, me } = require("../controllers/staffAuthController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { protect } = require("../middleware/authMiddleware");
const { requireStaff } = require("../middleware/requireStaff");
const { staffAuth } = require("../validators/schemas");

const router = express.Router();

// Staff login is PUBLIC (it is how a session starts) and so must sit above the
// app-wide auth gate, alongside the customer login. It carries the same strict
// authLimiter: this endpoint guards the admin API, which makes it the most
// worthwhile thing in the system to brute-force.
//
// There is deliberately NO signup route. Staff accounts are created with
// scripts/createStaffUser.js by someone with server access — a public endpoint
// that mints privileged accounts is exactly the hole this design avoids.
router.post(
  "/staff/auth/login",
  authLimiter,
  validate(staffAuth.login),
  asyncHandler(login)
);

// Re-hydrate the admin UI after a reload. protect + requireStaff are applied
// here explicitly because this route is mounted above the global gate.
router.get("/staff/auth/me", protect, requireStaff, asyncHandler(me));

module.exports = router;
