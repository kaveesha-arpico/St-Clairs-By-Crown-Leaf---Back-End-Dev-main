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

// Parse the webhook body from the RAW bytes with a bigint-aware parser. Express's
// global express.json() already parsed req.body with plain JSON.parse, which
// rounds Shopify's >53-bit ids (order/line-item/product/variant) — so we must
// re-parse the exact bytes captured for HMAC and keep every id as a string.
const JSONBig = require("json-bigint")({ storeAsString: true });

function parseWebhookPayload(req) {
  // rawBody is the exact bytes HMAC was verified over. If it is ever missing we
  // must NOT fall back to req.body: express.json() already parsed it with plain
  // JSON.parse and rounded every >53-bit id, so writing it would silently
  // reintroduce the corruption a previous fix removed. Fail closed instead — the
  // handler turns this into a 500 and Shopify retries the delivery.
  if (!req.rawBody || !req.rawBody.length) {
    throw new Error(
      "Missing raw webhook body — refusing to parse ids from the rounded req.body."
    );
  }
  return JSONBig.parse(req.rawBody.toString("utf8"));
}

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

// Shopify IDs exceed JS Number's 53-bit safe range, so they MUST stay strings
// end to end (the raw webhook body is parsed with json-bigint upstream). Never
// wrap them in Number()/BigInt() — either would round the trailing digits.
function toStringId(value) {
  return value === undefined || value === null ? null : String(value);
}

// Write the order and its line items. Upsert throughout: orders/create,
// orders/paid and orders/updated all carry the full order, and any may arrive
// first, out of order, or twice — the last write wins and bumps updated_at.
async function persistOrder(payload) {
  const orderId = String(payload.id);

  const orderData = {
    order_number: payload.name ?? null,
    email: payload.email ?? null,
    financial_status: payload.financial_status ?? null,
    fulfillment_status: payload.fulfillment_status ?? null,
    currency: payload.currency ?? null,
    subtotal_amount: toDecimal(payload.subtotal_price),
    total_amount: toDecimal(payload.total_price),
    cart_token: payload.cart_token ?? null,
    // Cancellation is the signal that must stop a downstream dispense; it comes
    // through orders/updated (or orders/cancelled), not the financial_status.
    cancelled_at: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
    shopify_created_at: payload.created_at ? new Date(payload.created_at) : null,
  };

  // The payload's line_items is the authoritative current set. We only prune
  // against it when Shopify actually sent the array — never against a partial
  // body, which would wrongly wipe an order's items.
  const hasLineItems = Array.isArray(payload.line_items);
  const lineItems = hasLineItems ? payload.line_items : [];

  await prisma.$transaction(async (tx) => {
    await tx.shopify_orders.upsert({
      where: { shopify_order_id: orderId },
      update: orderData,
      create: { shopify_order_id: orderId, ...orderData },
    });

    // Remove lines that are no longer on the order. An order edit that drops an
    // item re-delivers the order (via orders/updated) with a reduced
    // line_items array; without this the stale line lingers forever and the
    // machine would dispense something the customer removed.
    if (hasLineItems) {
      await tx.shopify_order_line_items.deleteMany({
        where: {
          shopify_order_id: orderId,
          line_item_id: { notIn: lineItems.map((item) => String(item.id)) },
        },
      });
    }

    for (const item of lineItems) {
      const itemData = {
        shopify_order_id: orderId,
        product_id: toStringId(item.product_id),
        variant_id: toStringId(item.variant_id),
        title: item.title ?? null,
        variant_title: item.variant_title ?? null,
        sku: item.sku ?? null,
        quantity: item.quantity ?? 0,
        price: toDecimal(item.price),
        blend_id: extractBlendId(item.properties),
        properties: item.properties ? JSON.stringify(item.properties) : null,
      };

      await tx.shopify_order_line_items.upsert({
        where: { line_item_id: String(item.id) },
        update: itemData,
        create: { line_item_id: String(item.id), ...itemData },
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

      await handler(parseWebhookPayload(req));

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

// POST /api/webhooks/shopify/orders-updated
// Fires on any change to an order — crucially cancellations and refunds. It just
// re-persists the full order, which updates financial_status / cancelled_at and
// bumps updated_at so downstream consumers (the machine feed) re-read it.
const ordersUpdated = makeWebhookHandler("orders/updated", async (payload) => {
  await persistOrder(payload);
});

module.exports = {
  ordersCreate,
  ordersPaid,
  ordersUpdated,
  persistOrder,
  extractBlendId,
};
