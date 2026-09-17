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

// The six statuses the machine reports. Anything else is a client bug → 400.
const VALID_STATUSES = new Set([
  "order_received",
  "pi_received",
  "blending",
  "completed",
  "rejected",
  "cancelled",
]);

// POST /api/machine/orders/status
// The machine reports what happened to an order. Append-only + idempotent:
//   - one row per (shopify_order_id, status); a retry/duplicate upserts and
//     returns 2xx (never 400), so the machine stops retrying.
//   - statuses are stored independently, so arrival order doesn't matter and a
//     mid-blend cancellation still records `completed` (tea physically exists).
//   - unknown order id -> 404 (machine logs + stops); invalid body -> 400.
// This never marks the order fulfilled in Shopify — dispensing isn't shipping.
const postMachineOrderStatus = async (req, res) => {
  const { shopify_order_id, status, reason, occurred_at } = req.body || {};

  if (typeof shopify_order_id !== "string" || shopify_order_id.trim() === "") {
    return res.status(400).json({ error: "shopify_order_id (string) is required." });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `status must be one of: ${[...VALID_STATUSES].join(", ")}.`,
    });
  }
  const epoch = Number(occurred_at);
  if (!Number.isFinite(epoch) || epoch <= 0) {
    return res
      .status(400)
      .json({ error: "occurred_at (epoch seconds) is required." });
  }
  const occurredAt = new Date(epoch * 1000);

  // Unknown order -> 404 so the machine stops retrying (rather than a 500).
  const order = await prisma.shopify_orders.findUnique({
    where: { shopify_order_id },
    select: { shopify_order_id: true },
  });
  if (!order) {
    return res.status(404).json({ error: "Unknown order id." });
  }

  const data = {
    reason: reason != null ? String(reason).slice(0, 500) : null,
    occurred_at: occurredAt,
  };

  // Idempotent on (order, status): a retry updates in place and still 2xx.
  await prisma.machine_order_statuses.upsert({
    where: {
      shopify_order_id_status: { shopify_order_id, status },
    },
    update: data,
    create: { shopify_order_id, status, ...data },
  });

  return res.status(200).json({ success: true });
};

module.exports = { getMachineOrders, postMachineOrderStatus };
