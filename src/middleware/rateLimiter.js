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

// TeaMatrix machine API (spec v1.1 §6.3). The machine polls /pending and
// /changes every 15 s (~120 requests per 15 min) plus status posts, so it must
// not share the 300/15 min public limit. Its router is mounted ABOVE apiLimiter
// in app.js and carries this limiter instead. Keyed per IP like the others.
const machineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1200, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    schema_version: 1,
    error_code: "RATE_LIMITED",
    message: "Too many requests from the machine. Slow down.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

// Guest order lookup: order numbers are sequential, so the (number, email)
// pair must not be guessable at speed. A real customer needs one or two tries.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many lookups. Please wait a few minutes and try again.",
  },
  skip: () => process.env.NODE_ENV === "test",
});

module.exports = { authLimiter, apiLimiter, contactLimiter, machineLimiter, lookupLimiter };
