const express = require("express");
const { signUp, login } = require("../controllers/authController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { auth } = require("../validators/schemas");

const router = express.Router();

router.post("/auth/login", authLimiter, validate(auth.login), asyncHandler(login));
router.post("/auth/signup", authLimiter, validate(auth.signup), asyncHandler(signUp));

module.exports = router;
