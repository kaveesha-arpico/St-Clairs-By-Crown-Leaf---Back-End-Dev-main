const express = require("express");
const {
  createTeaProduct,
  getAllTeaProducts,
  getAllTeaShopifyProducts,
  getAllTeaShopifyProductsVariants
} = require("../controllers/teaProductController");
const { protect } = require("../middleware/authMiddleware");
const { requireStaff } = require("../middleware/requireStaff");
const router = express.Router();

// This router is mounted above the global auth gate so the storefront reads
// below stay public. Creating a product is back-office work: staff only.
router.post("/tea-product-create", protect, requireStaff, createTeaProduct);
router.get("/get-tea-products", getAllTeaProducts);
router.get("/get-tea-shopify-products", getAllTeaShopifyProducts);
router.get("/get-tea-shopify-products-variants", getAllTeaShopifyProductsVariants);

module.exports = router;
