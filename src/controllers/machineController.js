// machineController.js
// Read-only order feed for the TeaMatrix dispensing machine. It polls this every
// 15-30s and pages forward by `updated_at` (ascending), with `since` an
// EXCLUSIVE lower bound so an edited/cancelled order reappears and can be
// re-checked before dispensing. Deliberately carries NO customer PII.

const prisma = require("../config/prisma");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

// No email/name/address/phone — this renders on a shop-floor screen.
const ORDER_SELECT = {
  shopify_order_id: true,
  order_number: true,
  financial_status: true,
  fulfillment_status: true,
  cancelled_at: true,
  shopify_created_at: true,
  updated_at: true,
  line_items: {
    select: {
      line_item_id: true,
      product_id: true,
      variant_id: true,
      title: true,
      variant_title: true,
      sku: true,
      quantity: true,
      blend_id: true,
      properties: true,
    },
  },
};

// Stored as a JSON string; hand back a real array (never a string-in-JSON).
function parseProperties(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function shapeOrder(o) {
  return {
    shopify_order_id: o.shopify_order_id,
    order_number: o.order_number,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    cancelled_at: o.cancelled_at,
    shopify_created_at: o.shopify_created_at,
    updated_at: o.updated_at,
    line_items: o.line_items.map((li) => ({
      line_item_id: li.line_item_id,
      product_id: li.product_id,
      variant_id: li.variant_id,
      title: li.title,
      variant_title: li.variant_title,
      sku: li.sku,
      quantity: li.quantity,
      blend_id: li.blend_id,
      properties: parseProperties(li.properties),
    })),
  };
}

// GET /api/machine/orders?since=<ISO8601>&limit=<n>
const getMachineOrders = async (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // `since` omitted -> from the beginning (bootstraps the first sync).
  const where = {};
  if (req.query.since !== undefined && req.query.since !== "") {
    const since = new Date(req.query.since);
    if (Number.isNaN(since.getTime())) {
      return res
        .status(400)
        .json({ error: "Invalid 'since' timestamp (expected ISO 8601)." });
    }
    where.updated_at = { gt: since };
  }

  // Fetch one extra row to detect whether more pages follow.
  const rows = await prisma.shopify_orders.findMany({
    where,
    orderBy: { updated_at: "asc" },
    take: limit + 1,
    select: ORDER_SELECT,
  });

  let hasMore = rows.length > limit;
  let page = rows;

  if (hasMore) {
    // `updated_at` is second-precision, so several orders can share a timestamp.
    // With an exclusive timestamp cursor we must never split such a group, or
    // the rest of it would be skipped on the next poll.
    const boundary = rows[limit - 1].updated_at.getTime();
    const overflow = rows[limit].updated_at.getTime();

    if (overflow !== boundary) {
      page = rows.slice(0, limit); // clean cut between two timestamps
    } else {
      // Trim back to before the shared timestamp...
      let cut = limit;
      while (cut > 0 && rows[cut - 1].updated_at.getTime() === boundary) cut--;
      if (cut > 0) {
        page = rows.slice(0, cut);
      } else {
        // ...unless the whole page is one timestamp (a burst larger than limit
        // in a single second — vanishingly rare here). Deliver the entire group
        // so the cursor can advance without loss.
        page = await prisma.shopify_orders.findMany({
          where: { updated_at: new Date(boundary) },
          orderBy: { updated_at: "asc" },
          select: ORDER_SELECT,
        });
      }
    }
  }

  const orders = page.map(shapeOrder);

  // Cursor for the next poll: the last row's updated_at (exclusive next time),
  // or the caller's `since` echoed back when the page is empty.
  const next_since =
    page.length > 0
      ? page[page.length - 1].updated_at.toISOString()
      : req.query.since || null;

  return res.status(200).json({ orders, has_more: hasMore, next_since });
};

module.exports = { getMachineOrders };
