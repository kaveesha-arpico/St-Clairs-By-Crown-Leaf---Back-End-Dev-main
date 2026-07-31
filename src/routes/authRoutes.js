const express = require("express");
const { signUp, login, me } = require("../controllers/authController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { protect } = require("../middleware/authMiddleware");
const { auth } = require("../validators/schemas");

const router = express.Router();

router.post("/auth/login", authLimiter, validate(auth.login), asyncHandler(login));
router.post("/auth/signup", authLimiter, validate(auth.signup), asyncHandler(signUp));
// Resolve the current user from a Bearer token (protect returns 401 on bad token).
router.get("/auth/me", protect, asyncHandler(me));

module.exports = router;
