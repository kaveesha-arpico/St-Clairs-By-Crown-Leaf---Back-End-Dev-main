const express = require("express");
const { honeypot, createContact } = require("../controllers/contactController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { contactLimiter } = require("../middleware/rateLimiter");
const { contact } = require("../validators/schemas");

const router = express.Router();

// Public contact form — no auth (visitors aren't signed in). Order matters:
//   1. rate limit per IP (429 on abuse)
//   2. honeypot (fake 201 + discard for bots, before validation)
//   3. validation (400 with per-field errors)
//   4. persist (201)
router.post(
  "/contact",
  contactLimiter,
  honeypot,
  validate(contact.create),
  asyncHandler(createContact)
);

module.exports = router;
