// shopifyWebhookController.js
// Handlers for Shopify order webhooks. Every route here is HMAC-verified by
// verifyShopifyWebhook before reaching these functions.
//
// Two rules drive the design:
//  1. Shopify may deliver the same event more than once, so processing is
//     idempotent — deliveries are logged by X-Shopify-Webhook-Id and a repeat
//     is acknowledged without being re-applied.
//  2. A failure must return a non-2xx status so Shopify retries rather than
//     silently dropping the event.

const prisma = require("../config/prisma");
const { normalizeCartToken } = require("../lib/cartToken");

// Cart-line attributes arrive as [{ name, value }]. Pull out the blend id so
// production can trace a custom blend back to its recipe.
const BLEND_ID_KEY = /^blend[\s_-]*id$/i;

function extractBlendId(properties) {
  if (!Array.isArray(properties)) return null;
  const match = properties.find(
    (p) => p && BLEND_ID_KEY.test(String(p.name || ""))
  );
  return match && match.value != null
    ? String(match.value).slice(0, 100)
    : null;
}

// Shopify sends money as strings ("25.00"); empty/missing becomes null.
function toDecimal(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function toBigInt(value) {
  return value === undefined || value === null ? null : BigInt(value);
}

// Write the order and its line items. Upsert throughout: orders/create and
// orders/paid both carry the full order, and either may arrive first or twice.
async function persistOrder(payload) {
  const orderId = BigInt(payload.id);

  const orderData = {
    order_number: payload.name ?? null,
    email: payload.email ?? null,
    financial_status: payload.financial_status ?? null,
    fulfillment_status: payload.fulfillment_status ?? null,
    currency: payload.currency ?? null,
    subtotal_amount: toDecimal(payload.subtotal_price),
    total_amount: toDecimal(payload.total_price),
    cart_token: payload.cart_token ?? null,
    shopify_created_at: payload.created_at ? new Date(payload.created_at) : null,
  };

  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];

  await prisma.$transaction(async (tx) => {
    await tx.shopify_orders.upsert({
      where: { shopify_order_id: orderId },
      update: orderData,
      create: { shopify_order_id: orderId, ...orderData },
    });

    for (const item of lineItems) {
      const itemData = {
        shopify_order_id: orderId,
        product_id: toBigInt(item.product_id),
        variant_id: toBigInt(item.variant_id),
        title: item.title ?? null,
        variant_title: item.variant_title ?? null,
        sku: item.sku ?? null,
        quantity: item.quantity ?? 0,
        price: toDecimal(item.price),
        blend_id: extractBlendId(item.properties),
        properties: item.properties ? JSON.stringify(item.properties) : null,
      };

      await tx.shopify_order_line_items.upsert({
        where: { line_item_id: BigInt(item.id) },
        update: itemData,
        create: { line_item_id: BigInt(item.id), ...itemData },
      });
    }
  });
}

/**
 * Wrap a topic handler with delivery logging and idempotency.
 * @param {string} topic - Shopify topic, e.g. "orders/paid".
 * @param {(payload: object) => Promise<void>} handler
 */
function makeWebhookHandler(topic, handler) {
  return async (req, res) => {
    const webhookId = req.get("X-Shopify-Webhook-Id");
    const shopDomain = req.get("X-Shopify-Shop-Domain") || null;

    try {
      // Skip work if this exact delivery already succeeded. Without an id we
      // can't dedupe, so we process rather than drop the event.
      if (webhookId) {
        const seen = await prisma.shopify_webhook_events.findUnique({
          where: { webhook_id: webhookId },
        });
        if (seen && seen.status === "processed") {
          return res.status(200).send("Already processed.");
        }

        await prisma.shopify_webhook_events.upsert({
          where: { webhook_id: webhookId },
          update: { status: "received", error_message: null },
          create: { webhook_id: webhookId, topic, shop_domain: shopDomain },
        });
      }

      await handler(req.body);

      if (webhookId) {
        await prisma.shopify_webhook_events.update({
          where: { webhook_id: webhookId },
          data: {
            status: "processed",
            processed_at: new Date(),
            error_message: null,
          },
        });
      }

      return res.status(200).send("Webhook processed.");
    } catch (err) {
      console.error(`[Shopify webhook ${topic}] failed:`, err.message);

      if (webhookId) {
        // Best-effort: never let the log write mask the original failure.
        await prisma.shopify_webhook_events
          .update({
            where: { webhook_id: webhookId },
            data: {
              status: "failed",
              error_message: String(err.message).slice(0, 1000),
            },
          })
          .catch(() => {});
      }

      // Non-2xx so Shopify retries this delivery.
      return res.status(500).send("Webhook processing failed.");
    }
  };
}

// POST /api/webhooks/shopify/orders-create
const ordersCreate = makeWebhookHandler("orders/create", async (payload) => {
  await persistOrder(payload);
});

// POST /api/webhooks/shopify/orders-paid
const ordersPaid = makeWebhookHandler("orders/paid", async (payload) => {
  await persistOrder(payload);

  // Keep the existing cart-status flow working: the storefront polls
  // /api/cart-status/:cartId to learn a cart was paid for. Store the canonical
  // bare token so it matches what the storefront polls with.
  const cartToken = normalizeCartToken(payload.cart_token);
  if (cartToken) {
    await prisma.paid_carts.upsert({
      where: { cart_token: cartToken },
      update: { paid_at: new Date() },
      create: { cart_token: cartToken },
    });
  }
});

module.exports = { ordersCreate, ordersPaid, persistOrder, extractBlendId };
