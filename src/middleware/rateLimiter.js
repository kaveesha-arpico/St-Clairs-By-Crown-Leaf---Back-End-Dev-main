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

// App-wide limiter for every /api route. Generous enough for normal browsing
// but caps abuse of the public storefront/checkout endpoints, which proxy
// straight to Shopify and would otherwise burn the store's API quota.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down and try again later.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

// Public contact form: a handful of messages per IP is plenty for a human;
// more is abuse. Message wording matches what the frontend renders on 429.
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // messages per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many messages. Please try again shortly.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

// Public traceability lookups. Tighter than the app-wide limiter because this
// endpoint is unauthenticated, hits several tables per call, and is the one
// place someone could try to walk the code space.
//
// Guessing a code is already hopeless (30^12 ~ 5.3e17 combinations), so this is
// less about the codes and more about the database: without it, a trivial
// script could keep the server busy for free. A real customer scans a label a
// handful of times, so 60 per quarter-hour is far beyond normal use.
const traceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // lookups per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    verified: false,
    message: "Too many lookups. Please wait a moment and try again.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter, apiLimiter, contactLimiter, traceLimiter };
