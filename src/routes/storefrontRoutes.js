const express = require("express");
const { getStorefrontProducts } = require("../controllers/storefrontController");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// Public storefront catalog (read-only, Storefront GraphQL API).
router.get("/storefront/products", asyncHandler(getStorefrontProducts));

module.exports = router;
