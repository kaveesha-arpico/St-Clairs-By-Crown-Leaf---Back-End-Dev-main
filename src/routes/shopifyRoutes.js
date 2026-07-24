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
const { shopify } = require("../validators/schemas");

const router = express.Router();

// This router is mounted above the global auth gate, so buyer-facing routes are
// public by default. Admin routes below carry `protect` explicitly — they read
// customer PII or write to the live store and must never be public.

// ---- Public (buyer-facing) ----
router.post("/checkout", validate(shopify.checkout), asyncHandler(checkout));
router.post("/payment-webhook", verifyShopifyWebhook, paymentWebhookHandler);
router.get("/cart-status/:cartId", getCartPaymentStatus);

// ---- Admin only (JWT required) ----
router.post("/create-shopify-product", protect, createProduct); // writes to live store
router.get("/get-shopify-store-products", protect, getProducts); // Admin sync + DB write
router.get("/get-shopify-products", protect, getProductsFromShopify); // Admin sync + DB write
router.get("/get-order-list", protect, getOrderDetails); // customer PII

module.exports = router;




