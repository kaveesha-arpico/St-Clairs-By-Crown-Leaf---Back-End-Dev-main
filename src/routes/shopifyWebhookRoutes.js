const express = require("express");
const {
  ordersCreate,
  ordersPaid,
} = require("../controllers/shopifyWebhookController");
const verifyShopifyWebhook = require("../middleware/verifyShopifyWebhook");

const router = express.Router();

// Shopify webhooks. Authenticated by HMAC signature (verifyShopifyWebhook),
// not JWT — Shopify is the caller, so these must sit above the auth gate.
// The handlers manage their own error responses: a non-2xx tells Shopify to
// retry the delivery.
router.post(
  "/webhooks/shopify/orders-create",
  verifyShopifyWebhook,
  ordersCreate
);
router.post("/webhooks/shopify/orders-paid", verifyShopifyWebhook, ordersPaid);

module.exports = router;
