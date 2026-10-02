const express = require("express");
const router = express.Router();
const { renderQr } = require("../controllers/qrController");
const asyncHandler = require("../middleware/asyncHandler");

// PUBLIC on purpose. The admin site shows these inline via <img src="...">, and
// an <img> tag cannot send an Authorization header — gating this behind the JWT
// would mean the admin UI could never display a QR without fetching and
// blob-ing every image by hand.
//
// Safe to expose because the handler performs no database lookup and reveals
// nothing about which codes exist (see qrController).
//
// The code and its extension arrive as one segment ("<CODE>.png") and are split
// in the controller, rather than as a path-to-regexp pattern, because "." is a
// delimiter in Express's route parser and the behaviour differs across versions.
router.get("/qr/:file", asyncHandler(renderQr));

module.exports = router;
