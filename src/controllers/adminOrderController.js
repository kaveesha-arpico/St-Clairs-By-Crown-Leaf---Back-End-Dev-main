// adminOrderController.js
// The admin site's order list: order number, products, trace code, QR link and
// packing progress. Behind protect + requireStaff.
//
// Customer names are NOT in this list. We store only the email, and the trace
// system is built to keep personal data out of the tables it reads. The name is
// available from a separate, admin-only endpoint that asks Shopify at the
// moment it is needed — see getOrderCustomer below.

const prisma = require("../config/prisma");
const { adminGraphQL } = require("../lib/shopifyAdmin");
const { normalizeTraceCode, isValidTraceCode } = require("../lib/traceCode");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function qrUrl(code) {
  const base = (process.env.TRACE_BASE_URL || "").trim();
  // The QR endpoint lives on this API, not on the trace site; TRACE_BASE_URL is
  // only what gets encoded INTO the image. Returning a relative path lets the
  // admin site resolve it against whichever API origin it is already talking
  // to, so this works in dev and production without extra configuration.
  return base ? `/api/qr/${code}.png` : null;
}

// GET /api/admin/orders?code=K7M2QP9XTR4B&order_number=1043&limit=50
//
// `code` is the support path: a customer emails "my code is X and the page is
// broken" and staff need to find that order. Shopify cannot answer that query,
// because the code only exists here.
exports.listOrders = async (req, res) => {
  const { code, order_number } = req.query;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT)
  );

  const where = {};

  if (code) {
    const normalized = normalizeTraceCode(code);
    // A malformed code can't match anything, so skip the query entirely rather
    // than returning an arbitrary first page that looks like a wrong answer.
    if (!isValidTraceCode(normalized)) {
      return res.status(200).json({ count: 0, orders: [] });
    }
    where.trace_code = { code: normalized };
  }

  if (order_number) {
    where.order_number = { contains: String(order_number) };
  }

  const orders = await prisma.shopify_orders.findMany({
    where,
    take: limit,
    orderBy: { shopify_created_at: "desc" },
    select: {
      shopify_order_id: true,
      order_number: true,
      financial_status: true,
      fulfillment_status: true,
      shopify_created_at: true,
      trace_code: {
        select: {
          code: true,
          status: true,
          dispatched_at: true,
          scan_count: true,
          first_scanned_at: true,
        },
      },
      line_items: {
        select: {
          line_item_id: true,
          title: true,
          variant_title: true,
          sku: true,
          quantity: true,
          allocations: { select: { quantity: true } },
        },
      },
    },
  });

  const rows = orders.map((order) => {
    const items = order.line_items.map((line) => {
      const allocated = line.allocations.reduce((n, a) => n + a.quantity, 0);
      return {
        line_item_id: line.line_item_id,
        title: line.title,
        variant_title: line.variant_title,
        sku: line.sku,
        quantity: line.quantity,
        allocated,
      };
    });

    return {
      shopify_order_id: order.shopify_order_id,
      order_number: order.order_number,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      created_at: order.shopify_created_at,
      trace_code: order.trace_code ? order.trace_code.code : null,
      trace_status: order.trace_code ? order.trace_code.status : null,
      dispatched_at: order.trace_code ? order.trace_code.dispatched_at : null,
      scan_count: order.trace_code ? order.trace_code.scan_count : null,
      qr_url: order.trace_code ? qrUrl(order.trace_code.code) : null,
      // Drives the "needs packing" filter in the admin UI.
      fully_packed:
        items.length > 0 && items.every((i) => i.allocated >= i.quantity),
      items,
    };
  });

  res.status(200).json({ count: rows.length, orders: rows });
};

// GET /api/admin/orders/:orderId/customer      (admin role only)
//
// Fetched from Shopify at the moment it is asked for, rather than stored. Our
// database deliberately holds no customer names: the traceability tables are
// read by a public endpoint, and the surest way to never leak a name is to
// never have one. The cost is that this call is slower than the rest of the
// list and fails when Shopify is unreachable, so the admin UI loads it
// separately instead of blocking the table on it.
exports.getOrderCustomer = async (req, res) => {
  const orderId = String(req.params.orderId);

  const exists = await prisma.shopify_orders.findUnique({
    where: { shopify_order_id: orderId },
    select: { shopify_order_id: true },
  });
  if (!exists) {
    return res.status(404).json({ message: "Order not found." });
  }

  const query = `
    query orderCustomer($id: ID!) {
      order(id: $id) {
        name
        email
        customer { firstName lastName }
        shippingAddress { name city countryCodeV2 }
      }
    }`;

  try {
    const data = await adminGraphQL(query, {
      id: `gid://shopify/Order/${orderId}`,
    });

    if (!data || !data.order) {
      return res
        .status(404)
        .json({ message: "Shopify has no record of that order." });
    }

    const { order } = data;
    const customer = order.customer || {};
    const name =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
      (order.shippingAddress && order.shippingAddress.name) ||
      null;

    return res.status(200).json({
      shopify_order_id: orderId,
      order_number: order.name,
      customer_name: name,
      email: order.email || null,
      city: order.shippingAddress ? order.shippingAddress.city : null,
      country: order.shippingAddress
        ? order.shippingAddress.countryCodeV2
        : null,
    });
  } catch (err) {
    // Shopify being down must not read as "this order has no customer".
    console.error("[admin] Shopify customer lookup failed:", err.message);
    return res.status(502).json({
      message: "Could not reach Shopify for customer details. Try again.",
    });
  }
};
