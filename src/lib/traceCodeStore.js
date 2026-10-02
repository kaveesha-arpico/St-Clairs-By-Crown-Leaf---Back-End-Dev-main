// traceCodeStore.js
// Persistence for traceability codes. The pure generation/validation logic
// lives in traceCode.js; this module is the only place that writes the table.

const prisma = require("../config/prisma");
const { generateTraceCode } = require("./traceCode");

// Attempts allowed when a freshly generated code collides with an existing one.
// At 30^12 codes a single collision is already vanishingly unlikely, so three
// attempts is less a retry budget than a guard against an exhausted entropy
// source silently returning the same bytes forever.
const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Return the trace code for an order, creating one if it has none.
 *
 * Idempotent and safe under concurrent webhook deliveries. Shopify may deliver
 * orders/paid more than once (and orders/fulfilled may arrive for an order
 * whose paid event we missed), so this must never mint a second code for an
 * order that already has one — the unique index on shopify_order_id guarantees
 * that, and a loser of the race simply re-reads the winner's row.
 *
 * The order row must already exist: trace_codes has a foreign key to
 * shopify_orders, so callers persist the order first.
 *
 * @param {string} shopifyOrderId - Shopify order id, as a string (never Number).
 * @returns {Promise<object>} the trace_codes row.
 */
async function ensureTraceCode(shopifyOrderId) {
  const orderId = String(shopifyOrderId);

  const existing = await prisma.trace_codes.findUnique({
    where: { shopify_order_id: orderId },
  });
  if (existing) return existing;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await prisma.trace_codes.create({
        data: { code: generateTraceCode(), shopify_order_id: orderId },
      });
    } catch (err) {
      // P2002 = unique constraint violation. Two different constraints can
      // raise it here and they need opposite responses, so rather than parsing
      // the error's target (which varies by adapter) we just ask the database
      // which case we are in:
      //
      //   - the ORDER now has a code  -> a concurrent delivery won the race;
      //                                  adopt its code, do not generate again.
      //   - the order still has none  -> the generated CODE collided with an
      //                                  unrelated row; generate a new one.
      if (err.code !== "P2002") throw err;

      const winner = await prisma.trace_codes.findUnique({
        where: { shopify_order_id: orderId },
      });
      if (winner) return winner;
    }
  }

  throw new Error(
    `Failed to generate a unique trace code for order ${orderId} after ${MAX_GENERATION_ATTEMPTS} attempts.`
  );
}

/**
 * Record the dispatch date for an order's trace code.
 *
 * Only fills an empty dispatched_at, so a partially-fulfilled order (which
 * fires orders/fulfilled once per fulfillment) keeps the date it FIRST went
 * out rather than having it overwritten by each later shipment.
 *
 * @param {string} shopifyOrderId
 * @param {Date} dispatchedAt
 * @returns {Promise<boolean>} true if this call set the date.
 */
async function markDispatched(shopifyOrderId, dispatchedAt) {
  const result = await prisma.trace_codes.updateMany({
    where: { shopify_order_id: String(shopifyOrderId), dispatched_at: null },
    data: { dispatched_at: dispatchedAt },
  });
  return result.count > 0;
}

module.exports = { ensureTraceCode, markDispatched, MAX_GENERATION_ATTEMPTS };
