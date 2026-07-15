// rateLimiter.js
// Rate limiters for sensitive endpoints. The auth limiter slows down
// credential-stuffing / brute-force attempts on login & signup.

const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
  // Disabled under test so integration tests aren't throttled.
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter };
