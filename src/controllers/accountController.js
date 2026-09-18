// accountController.js
// Signed-in customer's self-service views. Every handler scopes strictly to
// req.user (set by `protect`) — the email comes from the verified token, never
// from a query/param/body, so a customer can only ever see their own data.
//
// Orders are matched to a customer by email against shopify_orders (populated by
// the Shopify webhooks). Guest orders are still stored (the TeaMatrix machine
// dispenses from that table regardless of account) — they simply never surface
// here unless their email matches a signed-in customer.

const prisma = require("../config/prisma");
const {
  storefrontGraphQL,
  validateVariants,
} = require("../lib/shopifyStorefront");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Money is Decimal(10,2) in the DB. Normalise to a fixed 2dp string so the UI
// always gets "25.00", never "25" or a Decimal object.
const money = (d) => (d == null ? null : Number(d).toFixed(2));

// Customer-facing projection: order summary + line items. No cart_token, no
// internal ids beyond the order id (needed for reorder).
const ORDER_SELECT = {
  shopify_order_id: true,
  order_number: true,
  financial_status: true,
  fulfillment_status: true,
  cancelled_at: true,
  currency: true,
  subtotal_amount: true,
  total_amount: true,
  shopify_created_at: true,
  line_items: {
    select: {
      title: true,
      variant_title: true,
      sku: true,
      quantity: true,
      price: true,
      blend_id: true,
    },
  },
};

function shapeOrder(o) {
  return {
    id: o.shopify_order_id, // string id — used for POST /account/orders/:id/reorder
    order_number: o.order_number,
    placed_at: o.shopify_created_at,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    cancelled: o.cancelled_at != null,
    currency: o.currency,
    subtotal: money(o.subtotal_amount),
    total: money(o.total_amount),
    item_count: o.line_items.length,
    items: o.line_items.map((li) => ({
      title: li.title,
      variant_title: li.variant_title,
      sku: li.sku,
      quantity: li.quantity,
      price: money(li.price),
      is_custom_blend: li.blend_id != null,
    })),
  };
}

// GET /api/account/orders?limit=&offset=
// The signed-in customer's own orders, newest first.
const getMyOrders = async (req, res) => {
  const email = req.user && req.user.email;
  // A valid token always carries an email; guard so a malformed one can't leak
  // every order via an empty WHERE.
  if (!email) {
    return res.status(200).json({ orders: [], count: 0, has_more: false });
  }

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let offset = parseInt(req.query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  // Column collation is case-insensitive (utf8mb4_unicode_ci), so an exact
  // match already ignores case differences between signup and checkout email.
  const where = { email };

  const [count, rows] = await Promise.all([
    prisma.shopify_orders.count({ where }),
    prisma.shopify_orders.findMany({
      where,
      // shopify_created_at is the real placement time; fall back to our insert
      // time when Shopify didn't send one.
      orderBy: [{ shopify_created_at: "desc" }, { created_at: "desc" }],
      skip: offset,
      take: limit,
      select: ORDER_SELECT,
    }),
  ]);

  return res.status(200).json({
    orders: rows.map(shapeOrder),
    count,
    has_more: offset + rows.length < count,
  });
};

// --- Reorder ---------------------------------------------------------------
// Minimal cart-create: reorder only needs the checkout URL back, not the full
// cart shape the storefront cart endpoints return.
const REORDER_CART_CREATE = `
  mutation ReorderCartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { id checkoutUrl totalQuantity }
      userErrors { field message }
    }
  }
`;

const VARIANT_GID_PREFIX = "gid://shopify/ProductVariant/";

// POST /api/account/orders/:id/reorder
// Rebuild a Shopify cart from a past order's line items and hand back a
// checkout URL. v1 reorders standard products only: custom-blend lines (which
// carry a blend_id and need the recipe re-resolved) are skipped, as are lines
// whose variant no longer exists or is sold out. The response reports exactly
// what was added and what was skipped, so the UI can say "2 of 3 items added".
const reorder = async (req, res) => {
  const email = req.user && req.user.email;
  if (!email) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  const orderId = req.params.id;

  // Ownership is enforced by the email match: an order that isn't this user's
  // simply isn't found (404), which also avoids revealing that it exists.
  const order = await prisma.shopify_orders.findFirst({
    where: { shopify_order_id: orderId, email },
    select: {
      shopify_order_id: true,
      line_items: {
        select: {
          variant_id: true,
          quantity: true,
          title: true,
          variant_title: true,
          blend_id: true,
        },
      },
    },
  });
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found." });
  }

  const skipped = [];
  const candidates = [];
  for (const li of order.line_items) {
    const label = [li.title, li.variant_title].filter(Boolean).join(" – ");
    if (li.blend_id != null) {
      skipped.push({ title: label, reason: "custom_blend" });
    } else if (!li.variant_id) {
      skipped.push({ title: label, reason: "no_variant" });
    } else {
      candidates.push({
        gid: VARIANT_GID_PREFIX + li.variant_id,
        quantity: li.quantity > 0 ? li.quantity : 1,
        title: label,
      });
    }
  }

  // Drop anything Shopify no longer sells (discontinued) or has out of stock.
  const added = [];
  if (candidates.length > 0) {
    const { invalid, unavailable } = await validateVariants(
      candidates.map((c) => c.gid),
      { buyerIp: req.ip }
    );
    const invalidSet = new Set(invalid);
    const unavailableSet = new Set(unavailable);
    for (const c of candidates) {
      if (invalidSet.has(c.gid)) {
        skipped.push({ title: c.title, reason: "discontinued" });
      } else if (unavailableSet.has(c.gid)) {
        skipped.push({ title: c.title, reason: "sold_out" });
      } else {
        added.push(c);
      }
    }
  }

  if (added.length === 0) {
    return res.status(200).json({
      success: false,
      reason: "no_items_available",
      message: "None of the items on this order can be reordered right now.",
      added: [],
      skipped,
    });
  }

  // Merge duplicate variants (same variant across two lines) into one cart line.
  const qtyByGid = new Map();
  for (const c of added) {
    qtyByGid.set(c.gid, (qtyByGid.get(c.gid) || 0) + c.quantity);
  }
  const lines = [...qtyByGid.entries()].map(([merchandiseId, quantity]) => ({
    merchandiseId,
    quantity,
  }));

  // buyerIdentity prefills the checkout with the signed-in customer's email, so
  // reorder drops them at a ready-to-pay checkout.
  const data = await storefrontGraphQL(
    REORDER_CART_CREATE,
    { input: { lines, buyerIdentity: { email } } },
    { buyerIp: req.ip }
  );

  const result = data.cartCreate;
  if (result.userErrors && result.userErrors.length > 0) {
    return res.status(502).json({
      success: false,
      message: "Could not build the reorder cart.",
      errors: result.userErrors,
    });
  }

  return res.status(200).json({
    success: true,
    checkout_url: result.cart.checkoutUrl,
    cart_id: result.cart.id,
    added: added.map((c) => ({ title: c.title, quantity: c.quantity })),
    skipped,
  });
};

module.exports = { getMyOrders, reorder };
