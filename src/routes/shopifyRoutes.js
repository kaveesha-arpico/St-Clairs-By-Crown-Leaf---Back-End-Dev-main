const express = require("express");
const {
  checkout,
  createProduct,
  getProducts,
  getProductsFromShopify,
  getOrderDetails,
  getCartPaymentStatus,
  paymentWebhookHandler,
} = require("../controllers/shopifyController");
const verifyShopifyWebhook = require("../middleware/verifyShopifyWebhook");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { protect } = require("../middleware/authMiddleware");
const { requireStaff } = require("../middleware/requireStaff");
const { shopify } = require("../validators/schemas");

const router = express.Router();

// This router is mounted above the global auth gate, so buyer-facing routes are
// public by default. Admin routes below carry `protect` + `requireStaff`
// explicitly — they read customer PII or write to the live store. `protect`
// alone is not enough: the public signup endpoint issues a valid token to anyone.

// ---- Public (buyer-facing) ----
router.post("/checkout", validate(shopify.checkout), asyncHandler(checkout));
router.post("/payment-webhook", verifyShopifyWebhook, paymentWebhookHandler);
router.get("/cart-status/:cartId", getCartPaymentStatus);

// ---- Admin only (staff JWT required) ----
router.post("/create-shopify-product", protect, requireStaff, createProduct); // writes to live store
router.get("/get-shopify-store-products", protect, requireStaff, getProducts); // Admin sync + DB write
router.get("/get-shopify-products", protect, requireStaff, getProductsFromShopify); // Admin sync + DB write
router.get("/get-order-list", protect, requireStaff, getOrderDetails); // customer PII

module.exports = router;




