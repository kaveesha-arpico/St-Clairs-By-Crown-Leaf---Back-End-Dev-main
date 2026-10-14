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
const { toDateOnly } = require("../lib/dates");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// GET /api/admin/orders?code=K7M2QP9XTR4B&order_number=1043&limit=50
//
// `code` is the support path: a customer emails "my jar's code is X and the
// page is broken" and staff need to find the order that jar went out in.
// Shopify cannot answer that query, because the code only exists here.
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
    // The order that contains the line that contains this jar.
    where.line_items = { some: { trace_codes: { some: { code: normalized } } } };
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
      dispatched_at: true,
      line_items: {
        select: {
          line_item_id: true,
          title: true,
          variant_title: true,
          sku: true,
          quantity: true,
          trace_codes: {
            select: {
              code: true,
              mismatch_override: true,
              pack_run: { select: { pack_run_code: true, packed_date: true } },
            },
          },
        },
      },
    },
  });

  const rows = orders.map((order) => {
    const items = order.line_items.map((line) => ({
      line_item_id: line.line_item_id,
      title: line.title,
      variant_title: line.variant_title,
      sku: line.sku,
      quantity: line.quantity,
      allocated: line.trace_codes.length,
      // The jars packed into this line so far.
      codes: line.trace_codes.map((c) => ({
        code: c.code,
        pack_run_code: c.pack_run.pack_run_code,
        packed_date: toDateOnly(c.pack_run.packed_date),
        mismatch_override: c.mismatch_override,
        qr_url: `/api/qr/${c.code}.png`,
      })),
    }));

    return {
      shopify_order_id: order.shopify_order_id,
      order_number: order.order_number,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      created_at: order.shopify_created_at,
      dispatched_at: order.dispatched_at,
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
