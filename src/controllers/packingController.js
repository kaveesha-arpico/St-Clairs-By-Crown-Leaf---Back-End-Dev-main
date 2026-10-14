// packingController.js
// Links JARS to order lines — the step that connects a customer's order to the
// tea's provenance. The packer scans each jar's trace code as it goes into the
// box; that scan sets trace_codes.line_item_id, and "allocated" for a line is
// simply how many jars are on it.
//
// Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");
const { toDateOnly } = require("../lib/dates");
const { normalizeTraceCode, isValidTraceCode } = require("../lib/traceCode");

/**
 * Does this jar's pack run hold the product the order line is for?
 *
 * A packer reaching for the wrong caddy is the one mistake that produces
 * actively WRONG traceability — a page telling a customer their Moray BOP came
 * from a Golden Tips lot. That is worse than showing nothing, because it is
 * confidently false, so the scan is checked rather than trusted.
 *
 * Both identifiers are compared, and either one disagreeing is a mismatch:
 *   - product id differing means a different tea entirely
 *   - product id matching but SKU differing means the right tea in the wrong
 *     size, which still puts the wrong weight on the page
 *
 * A comparison is only made when BOTH sides carry the value. Pack runs may be
 * recorded without a SKU or product id, and an order line from an older import
 * may lack them too; refusing those would block legitimate packing over missing
 * reference data rather than over an actual mismatch.
 */
function productMismatch(line, run) {
  const pairs = [
    ["product_id", line.product_id, run.shopify_product_id],
    ["sku", line.sku, run.sku],
  ];
  for (const [field, ordered, scanned] of pairs) {
    if (!ordered || !scanned) continue;
    if (String(ordered) !== String(scanned)) {
      return { field, expected: String(ordered), scanned: String(scanned) };
    }
  }
  return null;
}

const CODE_SELECT = {
  code: true,
  status: true,
  line_item_id: true,
  allocated_at: true,
  mismatch_override: true,
  pack_run: {
    select: {
      pack_run_code: true,
      packed_date: true,
      shopify_product_id: true,
      sku: true,
      lot: {
        select: {
          lot_number: true,
          estate: { select: { name: true } },
          factory: { select: { name: true } },
        },
      },
    },
  },
};

function presentCode(c) {
  return {
    code: c.code,
    pack_run_code: c.pack_run.pack_run_code,
    packed_date: toDateOnly(c.pack_run.packed_date),
    lot_number: c.pack_run.lot.lot_number,
    estate: c.pack_run.lot.estate.name,
    factory: c.pack_run.lot.factory.name,
    allocated_at: c.allocated_at,
    mismatch_override: c.mismatch_override,
  };
}

// GET /api/admin/orders/:orderId/allocations
// Packing state for an order: every line, which jars are in it so far, and how
// many are still outstanding.
exports.getOrderAllocations = async (req, res) => {
  const order = await prisma.shopify_orders.findUnique({
    where: { shopify_order_id: String(req.params.orderId) },
    select: {
      shopify_order_id: true,
      order_number: true,
      line_items: {
        select: {
          line_item_id: true,
          title: true,
          variant_title: true,
          sku: true,
          quantity: true,
          trace_codes: { select: CODE_SELECT, orderBy: { allocated_at: "asc" } },
        },
      },
    },
  });
  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const lines = order.line_items.map((line) => ({
    line_item_id: line.line_item_id,
    title: line.title,
    variant_title: line.variant_title,
    sku: line.sku,
    quantity: line.quantity,
    allocated: line.trace_codes.length,
    outstanding: line.quantity - line.trace_codes.length,
    codes: line.trace_codes.map(presentCode),
  }));

  res.status(200).json({
    shopify_order_id: order.shopify_order_id,
    order_number: order.order_number,
    fully_packed: lines.every((l) => l.outstanding <= 0),
    lines,
  });
};

// POST /api/admin/orders/:orderId/allocations
//
// Body: { scans: [ { line_item_id, code, allow_product_mismatch? }, ... ] }
//
// Each scan links one jar to one line. Several scans are accepted at once so an
// operator can pack a whole order and submit in one go; the entire request
// succeeds or fails together, because a partially recorded order is worse than
// a rejected one — the operator has no way to tell which scans landed.
exports.recordScans = async (req, res) => {
  const orderId = String(req.params.orderId);
  const input = req.body.scans;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.shopify_orders.findUnique({
        where: { shopify_order_id: orderId },
        select: {
          line_items: {
            select: {
              line_item_id: true,
              quantity: true,
              product_id: true,
              sku: true,
              trace_codes: { select: { code: true } },
            },
          },
        },
      });
      if (!order) throw Object.assign(new Error("ORDER_NOT_FOUND"));

      // Only lines belonging to THIS order are packable. Without this check a
      // valid line_item_id from somebody else's order would be accepted, and
      // their trace page would start showing this order's jars.
      const linesById = new Map(order.line_items.map((l) => [l.line_item_id, l]));

      // Normalize and resolve every scanned code up front, so a bad one fails
      // the request before anything is written.
      const scans = input.map((s) => ({
        lineId: String(s.line_item_id),
        code: normalizeTraceCode(s.code),
        raw: String(s.code),
        override: s.allow_product_mismatch === true,
      }));

      const malformed = scans.filter((s) => !isValidTraceCode(s.code)).map((s) => s.raw);
      if (malformed.length > 0) {
        throw Object.assign(new Error("UNKNOWN_CODES"), { detail: malformed });
      }

      const codes = await tx.trace_codes.findMany({
        where: { code: { in: [...new Set(scans.map((s) => s.code))] } },
        select: {
          ...CODE_SELECT,
          line_item: { select: { order: { select: { order_number: true } } } },
        },
      });
      const byCode = new Map(codes.map((c) => [c.code, c]));

      const unknown = scans.filter((s) => !byCode.has(s.code)).map((s) => s.raw);
      if (unknown.length > 0) {
        throw Object.assign(new Error("UNKNOWN_CODES"), { detail: unknown });
      }

      // Project the final jar count per line BEFORE writing, so an
      // over-allocation anywhere rejects the whole batch.
      const projected = new Map();
      for (const line of order.line_items) {
        projected.set(line.line_item_id, new Set(line.trace_codes.map((c) => c.code)));
      }

      const toWrite = [];
      for (const scan of scans) {
        const line = linesById.get(scan.lineId);
        if (!line) {
          throw Object.assign(new Error("LINE_NOT_ON_ORDER"), { detail: scan.lineId });
        }
        const jar = byCode.get(scan.code);

        if (jar.status !== "active") {
          throw Object.assign(new Error("CODE_REVOKED"), { detail: scan.code });
        }

        // A jar already in a box can't go in another. Scanning it again
        // against the SAME line is harmless (a double-scan) and is skipped.
        if (jar.line_item_id && jar.line_item_id !== scan.lineId) {
          throw Object.assign(new Error("CODE_ALREADY_USED"), {
            detail: {
              code: scan.code,
              order_number: jar.line_item ? jar.line_item.order.order_number : null,
            },
          });
        }
        if (jar.line_item_id === scan.lineId) continue;

        // Refuse a jar of the wrong tea unless the operator explicitly says
        // they mean it.
        const mismatch = productMismatch(line, jar.pack_run);
        if (mismatch && !scan.override) {
          throw Object.assign(new Error("PRODUCT_MISMATCH"), {
            detail: {
              line_item_id: scan.lineId,
              code: scan.code,
              pack_run_code: jar.pack_run.pack_run_code,
              field: mismatch.field,
              ordered: mismatch.expected,
              scanned: mismatch.scanned,
            },
          });
        }

        projected.get(scan.lineId).add(scan.code);
        toWrite.push({ code: scan.code, lineId: scan.lineId, overrode: !!mismatch });
      }

      for (const [lineId, set] of projected) {
        const ordered = linesById.get(lineId).quantity;
        if (set.size > ordered) {
          throw Object.assign(new Error("OVER_ALLOCATED"), {
            detail: { line_item_id: lineId, allocated: set.size, ordered },
          });
        }
      }

      const now = new Date();
      for (const w of toWrite) {
        await tx.trace_codes.update({
          where: { code: w.code },
          data: {
            line_item_id: w.lineId,
            allocated_at: now,
            mismatch_override: w.overrode,
          },
        });
      }

      return { recorded: toWrite.length, skipped: scans.length - toWrite.length };
    });

    res.status(201).json({ message: "Jars recorded.", ...result });
  } catch (err) {
    switch (err.message) {
      case "ORDER_NOT_FOUND":
        return res.status(404).json({ message: "Order not found." });
      case "UNKNOWN_CODES":
        return res.status(400).json({
          error: "unknown_codes",
          message: "One or more trace codes were not recognised.",
          unknown_codes: err.detail,
        });
      case "LINE_NOT_ON_ORDER":
        return res.status(400).json({
          error: "line_not_on_order",
          message: "That line item does not belong to this order.",
          line_item_id: err.detail,
        });
      case "CODE_REVOKED":
        return res.status(400).json({
          error: "code_revoked",
          message: "That trace code has been revoked and cannot be packed.",
          code: err.detail,
        });
      case "CODE_ALREADY_USED":
        return res.status(400).json({
          error: "code_already_used",
          message: err.detail.order_number
            ? `That jar is already packed into order ${err.detail.order_number}.`
            : "That jar is already packed into another order.",
          ...err.detail,
        });
      case "PRODUCT_MISMATCH":
        return res.status(400).json({
          error: "product_mismatch",
          message:
            "That jar holds a different product from the one ordered (" +
            err.detail.field + ": ordered " + err.detail.ordered +
            ", scanned " + err.detail.scanned + "). Check you have the right " +
            "jar. To record it anyway, resend that scan with " +
            "allow_product_mismatch: true.",
          ...err.detail,
        });
      case "OVER_ALLOCATED":
        return res.status(400).json({
          error: "over_allocated",
          message: `Cannot put ${err.detail.allocated} jars on a line that ordered ${err.detail.ordered}.`,
          ...err.detail,
        });
      default:
        throw err;
    }
  }
};

// DELETE /api/admin/orders/:orderId/allocations/:code
// Take a jar back out of an order (undo a mis-scan). The jar keeps its identity
// and its provenance; it just stops being "in this order".
exports.removeScan = async (req, res) => {
  const orderId = String(req.params.orderId);
  const code = normalizeTraceCode(req.params.code);

  const jar = await prisma.trace_codes.findUnique({
    where: { code },
    select: { line_item: { select: { shopify_order_id: true } } },
  });
  if (!jar || !jar.line_item || jar.line_item.shopify_order_id !== orderId) {
    return res.status(404).json({ message: "That jar is not in this order." });
  }

  await prisma.trace_codes.update({
    where: { code },
    data: { line_item_id: null, allocated_at: null, mismatch_override: false },
  });
  res.status(200).json({ message: "Jar removed from order." });
};
