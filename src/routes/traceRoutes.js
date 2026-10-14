const express = require("express");
const router = express.Router();
const { getTrace } = require("../controllers/traceController");
const asyncHandler = require("../middleware/asyncHandler");
const { traceLimiter } = require("../middleware/rateLimiter");

// PUBLIC — this is the page a scanned QR opens, so there is no token to send.
// Mounted above the auth gate in app.js.
//
// traceLimiter is the only thing standing between this endpoint and someone
// walking the code space. The codes themselves are the real defence (30^12 is
// unguessable), but the limiter stops the attempt costing us a database query
// each time.
router.get("/trace/:code", traceLimiter, asyncHandler(getTrace));

module.exports = router;
