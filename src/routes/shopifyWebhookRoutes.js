const express = require("express");
const {
  ordersCreate,
  ordersPaid,
  ordersUpdated,
  ordersFulfilled,
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
// orders/updated delivers cancellations, refunds and edits (register in Shopify).
router.post(
  "/webhooks/shopify/orders-updated",
  verifyShopifyWebhook,
  ordersUpdated
);

// orders/fulfilled supplies the dispatch date for the public trace page.
// Register in Shopify as "Order fulfillment" (not "Fulfillment creation").
router.post(
  "/webhooks/shopify/orders-fulfilled",
  verifyShopifyWebhook,
  ordersFulfilled
);

module.exports = router;
