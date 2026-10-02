// packingController.js
// Records which pack run(s) fulfilled each line of an order — the step that
// connects a customer's order to the tea's provenance. Without it the trace
// page has nothing to show.
//
// The packing screen scans a pack-run barcode, picks the order line it is for,
// and posts the quantity. Every route here is behind protect + requireStaff.

const prisma = require("../config/prisma");

// GET /api/admin/orders/:orderId/allocations
// Current packing state for an order: every line, what is allocated so far and
// how much is still outstanding.
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
          allocations: {
            include: {
              pack_run: {
                include: {
                  lot: {
                    include: {
                      estate: { select: { name: true, region: true } },
                      factory: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const lines = order.line_items.map((line) => {
    const allocated = line.allocations.reduce((n, a) => n + a.quantity, 0);
    return {
      line_item_id: line.line_item_id,
      title: line.title,
      variant_title: line.variant_title,
      sku: line.sku,
      quantity: line.quantity,
      allocated,
      outstanding: line.quantity - allocated,
      allocations: line.allocations.map((a) => ({
        allocation_id: a.allocation_id,
        quantity: a.quantity,
        pack_run_code: a.pack_run.pack_run_code,
        packed_date: a.pack_run.packed_date,
        lot_number: a.pack_run.lot.lot_number,
        estate: a.pack_run.lot.estate.name,
        factory: a.pack_run.lot.factory.name,
      })),
    };
  });

  res.status(200).json({
    shopify_order_id: order.shopify_order_id,
    order_number: order.order_number,
    fully_packed: lines.every((l) => l.outstanding === 0),
    lines,
  });
};

// POST /api/admin/orders/:orderId/allocations
//
// Body: { allocations: [ { line_item_id, pack_run_code, quantity }, ... ] }
//
// Accepts several scans at once so an operator can pack a whole order and
// submit in one go. The entire request succeeds or fails together — a partially
// recorded order is worse than a rejected one, because the operator has no way
// to tell which scans landed.
exports.createAllocations = async (req, res) => {
  const orderId = String(req.params.orderId);
  const input = req.body.allocations;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.shopify_orders.findUnique({
        where: { shopify_order_id: orderId },
        select: {
          line_items: {
            select: {
              line_item_id: true,
              quantity: true,
              allocations: {
                select: { pack_run_id: true, quantity: true },
              },
            },
          },
        },
      });
      if (!order) throw Object.assign(new Error("ORDER_NOT_FOUND"), { status: 404 });

      // Only lines belonging to THIS order are allocatable. Without this check
      // a valid line_item_id from somebody else's order would be accepted, and
      // their trace page would start showing this order's tea.
      const linesById = new Map(
        order.line_items.map((line) => [line.line_item_id, line])
      );

      // Resolve every scanned barcode up front, so an unknown code fails the
      // request before anything is written.
      const codes = [...new Set(input.map((a) => String(a.pack_run_code)))];
      const runs = await tx.pack_runs.findMany({
        where: { pack_run_code: { in: codes } },
        select: { pack_run_id: true, pack_run_code: true },
      });
      const runsByCode = new Map(runs.map((r) => [r.pack_run_code, r]));

      const unknown = codes.filter((c) => !runsByCode.has(c));
      if (unknown.length > 0) {
        throw Object.assign(new Error("UNKNOWN_PACK_RUN"), {
          status: 400,
          detail: unknown,
        });
      }

      // Project the final allocated quantity per line BEFORE writing, so an
      // over-allocation is rejected rather than half-applied. Existing rows
      // count toward the total; a repeat scan of the same run on the same line
      // REPLACES its previous quantity rather than adding to it, which is what
      // an operator correcting a mis-typed count expects.
      const projected = new Map();
      for (const line of order.line_items) {
        const byRun = new Map(
          line.allocations.map((a) => [a.pack_run_id, a.quantity])
        );
        projected.set(line.line_item_id, byRun);
      }

      for (const item of input) {
        const lineId = String(item.line_item_id);
        const line = linesById.get(lineId);
        if (!line) {
          throw Object.assign(new Error("LINE_NOT_ON_ORDER"), {
            status: 400,
            detail: lineId,
          });
        }
        const run = runsByCode.get(String(item.pack_run_code));
        projected.get(lineId).set(run.pack_run_id, Number(item.quantity));
      }

      for (const [lineId, byRun] of projected) {
        const total = [...byRun.values()].reduce((n, q) => n + q, 0);
        const ordered = linesById.get(lineId).quantity;
        if (total > ordered) {
          throw Object.assign(new Error("OVER_ALLOCATED"), {
            status: 400,
            detail: { line_item_id: lineId, allocated: total, ordered },
          });
        }
      }

      // Validation passed — write. Upsert on the (line, run) unique index so a
      // re-scan updates in place instead of colliding.
      for (const item of input) {
        const lineId = String(item.line_item_id);
        const run = runsByCode.get(String(item.pack_run_code));
        await tx.order_allocations.upsert({
          where: {
            line_item_id_pack_run_id: {
              line_item_id: lineId,
              pack_run_id: run.pack_run_id,
            },
          },
          update: { quantity: Number(item.quantity) },
          create: {
            line_item_id: lineId,
            pack_run_id: run.pack_run_id,
            quantity: Number(item.quantity),
          },
        });
      }

      return { recorded: input.length };
    });

    res
      .status(201)
      .json({ message: "Allocations recorded.", ...result });
  } catch (err) {
    switch (err.message) {
      case "ORDER_NOT_FOUND":
        return res.status(404).json({ message: "Order not found." });
      case "UNKNOWN_PACK_RUN":
        return res.status(400).json({
          message: "One or more pack run codes were not recognised.",
          unknown_codes: err.detail,
        });
      case "LINE_NOT_ON_ORDER":
        return res.status(400).json({
          message: "That line item does not belong to this order.",
          line_item_id: err.detail,
        });
      case "OVER_ALLOCATED":
        return res.status(400).json({
          message: `Cannot allocate ${err.detail.allocated} units to a line that ordered ${err.detail.ordered}.`,
          ...err.detail,
        });
      default:
        throw err;
    }
  }
};

// DELETE /api/admin/allocations/:id
// Undo a mis-scan. Safe to allow freely: it only removes the link between an
// order line and a pack run, leaving both intact.
exports.deleteAllocation = async (req, res) => {
  try {
    await prisma.order_allocations.delete({
      where: { allocation_id: Number(req.params.id) },
    });
    res.status(200).json({ message: "Allocation removed." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Allocation not found." });
    }
    throw err;
  }
};
