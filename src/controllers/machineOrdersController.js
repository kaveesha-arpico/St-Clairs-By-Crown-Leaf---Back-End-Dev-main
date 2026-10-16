// machineOrdersController.js
// The TeaMatrix machine API over machine_orders (spec v1.1 §7). Three
// endpoints, all behind machineAuth (own API key + optional IP allowlist):
//
//   GET  /api/machine/orders/pending      paid blends not yet collected
//   GET  /api/machine/orders/changes      payment changes on collected blends
//   POST /api/machine/orders/:id/status   the machine reports progress
//
// Rules for all three: JSON only, every response carries schema_version 1, ids
// are strings, timestamps are ISO-8601 UTC with milliseconds. Errors are
// { schema_version, error_code, message } with the HTTP status shown in §7.

const prisma = require("../config/prisma");

const SCHEMA_VERSION = 1;

// §8.2 — written only here. `new` is the default and may not be posted.
const MACHINE_STATUSES = new Set([
  "order_received",
  "pi_received",
  "queued",
  "blending",
  "completed",
  "failed",
  "rejected",
  "cancelled",
]);
const TERMINAL = new Set(["completed", "rejected", "cancelled"]);

const PENDING_DEFAULT = 50;
const PENDING_MAX = 100;
const CHANGES_DEFAULT = 100;
const CHANGES_MAX = 200;

function fail(res, status, code, message, extra = {}) {
  return res
    .status(status)
    .json({ schema_version: SCHEMA_VERSION, error_code: code, message, ...extra });
}

function parseLimit(raw, def, max) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : null);
const sid = (v) => (v === null || v === undefined ? null : String(v));

// recipe_json is stored as-is; hand back the ingredients array exactly.
function ingredientsOf(recipe) {
  if (recipe && typeof recipe === "object" && Array.isArray(recipe.ingredients)) {
    return recipe.ingredients;
  }
  return [];
}

// ---- GET /api/machine/orders/pending (§7.1) ---------------------------------
// Read-only: an order stays listed until the machine posts order_received.
const getPendingOrders = async (req, res) => {
  const limit = parseLimit(req.query.limit, PENDING_DEFAULT, PENDING_MAX);

  const rows = await prisma.machine_orders.findMany({
    where: {
      payment_status: "paid",
      machine_status: "new",
      validation_error: null,
      is_test: false,
    },
    orderBy: [{ paid_at: "asc" }, { id: "asc" }],
    take: limit + 1, // one extra to detect has_more
  });

  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;

  return res.status(200).json({
    schema_version: SCHEMA_VERSION,
    orders: page.map((o) => ({
      id: sid(o.id),
      shopify_order_id: o.shopify_order_id,
      shopify_line_item_id: o.shopify_line_item_id,
      order_number: o.order_number,
      blend_ref: o.blend_ref,
      customer_display_name: o.customer_display_name,
      units: o.units,
      total_weight_g: o.total_weight_g,
      ingredients: ingredientsOf(o.recipe_json),
      payment_status: o.payment_status,
      paid_at: iso(o.paid_at),
    })),
    has_more,
  });
};

// ---- GET /api/machine/orders/changes (§7.2) ---------------------------------
// Payment changes (cancellations, refunds) on orders the machine has already
// collected. Pages on the (payment_status_updated_at, id) pair, which is exact,
// so no timestamp-group trimming is needed. The machine re-reads a short
// overlap each poll and ignores changes it has applied.
const getChanges = async (req, res) => {
  const { since: rawSince, after_id: rawAfter } = req.query;
  if (rawSince === undefined || rawSince === "") {
    return fail(res, 400, "MISSING_SINCE", "since (ISO-8601 timestamp) is required.");
  }
  const since = new Date(rawSince);
  if (Number.isNaN(since.getTime())) {
    return fail(res, 400, "INVALID_SINCE", "since must be an ISO-8601 timestamp.");
  }
  let afterId = 0n;
  if (rawAfter !== undefined && rawAfter !== "") {
    if (!/^\d+$/.test(String(rawAfter))) {
      return fail(res, 400, "INVALID_AFTER_ID", "after_id must be a machine_orders id.");
    }
    afterId = BigInt(rawAfter);
  }
  const limit = parseLimit(req.query.limit, CHANGES_DEFAULT, CHANGES_MAX);

  const rows = await prisma.machine_orders.findMany({
    where: {
      machine_status: { not: "new" },
      OR: [
        { payment_status_updated_at: { gt: since } },
        { payment_status_updated_at: since, id: { gt: afterId } },
      ],
    },
    orderBy: [{ payment_status_updated_at: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      order_number: true,
      payment_status: true,
      payment_status_updated_at: true,
      machine_status: true,
    },
  });

  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return res.status(200).json({
    schema_version: SCHEMA_VERSION,
    changes: page.map((c) => ({
      id: sid(c.id),
      order_number: c.order_number,
      payment_status: c.payment_status,
      payment_status_updated_at: iso(c.payment_status_updated_at),
      machine_status: c.machine_status,
    })),
    // Empty page: echo the caller's own cursor so it can poll again unchanged.
    next_since: last ? iso(last.payment_status_updated_at) : since.toISOString(),
    next_after_id: last ? sid(last.id) : String(afterId),
    has_more,
  });
};

// ---- POST /api/machine/orders/:id/status (§7.3) -----------------------------
// :id is the machine_orders id, so each line has its own status. Checked in the
// order the spec lists; statuses may jump (no sequence is enforced).
const postStatus = async (req, res) => {
  const rawId = req.params.id;
  if (!/^\d+$/.test(String(rawId))) {
    return fail(res, 404, "NOT_FOUND", "Unknown machine order id.");
  }
  const id = BigInt(rawId);
  const body = req.body || {};
  const next = body.machine_status;
  const machineRef = body.machine_ref != null ? String(body.machine_ref).slice(0, 64) : undefined;
  const reason = body.reason != null ? String(body.reason).slice(0, 255) : undefined;

  // 1. Row not found -> 404
  const row = await prisma.machine_orders.findUnique({
    where: { id },
    select: {
      id: true,
      machine_status: true,
      payment_status: true,
      validation_error: true,
    },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Unknown machine order id.");

  // 2. Status not in §8.2, or `new` -> 422
  if (typeof next !== "string" || !MACHINE_STATUSES.has(next)) {
    return fail(
      res,
      422,
      "INVALID_STATUS",
      `machine_status must be one of: ${[...MACHINE_STATUSES].join(", ")}.`
    );
  }

  const reply = (status, machine_status) =>
    res.status(status).json({
      schema_version: SCHEMA_VERSION,
      id: sid(row.id),
      machine_status,
      payment_status: row.payment_status,
    });

  // 3. Same as current -> 200, no change, no event (safe retry)
  if (next === row.machine_status) return reply(200, row.machine_status);

  // 4. Current is terminal -> 409
  if (TERMINAL.has(row.machine_status)) {
    return fail(res, 409, "TERMINAL_STATE", `Order is already ${row.machine_status}.`, {
      machine_status: row.machine_status,
    });
  }

  // 5. Recipe invalid -> 409
  if (row.validation_error) {
    return fail(res, 409, "ORDER_INVALID", `Order has validation_error ${row.validation_error}.`, {
      validation_error: row.validation_error,
    });
  }

  // 6. Collecting an order that is not paid -> 409 (with payment_status)
  if (next === "order_received" && row.payment_status !== "paid") {
    return fail(res, 409, "NOT_PAYABLE", `Order payment_status is ${row.payment_status}.`, {
      payment_status: row.payment_status,
    });
  }

  // 7. Otherwise: update + event, 200. Server time is stored; `at` is informational.
  const now = new Date();
  await prisma.$transaction([
    prisma.machine_orders.update({
      where: { id },
      data: {
        machine_status: next,
        machine_status_updated_at: now,
        ...(machineRef !== undefined ? { machine_ref: machineRef } : {}),
        ...(reason !== undefined ? { machine_status_reason: reason } : {}),
      },
    }),
    prisma.machine_order_events.create({
      data: {
        machine_order_id: id,
        kind: "machine",
        from_status: row.machine_status,
        to_status: next,
        detail: reason ?? null,
      },
    }),
  ]);

  return reply(200, next);
};

module.exports = {
  getPendingOrders,
  getChanges,
  postStatus,
  // exported for tests
  MACHINE_STATUSES,
  TERMINAL,
};
