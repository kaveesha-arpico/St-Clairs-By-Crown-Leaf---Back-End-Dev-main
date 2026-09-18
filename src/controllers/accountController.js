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

module.exports = { getMyOrders };
