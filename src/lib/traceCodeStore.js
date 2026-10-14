// traceCodeStore.js
// Persistence for traceability codes. The pure generation/validation logic
// lives in traceCode.js; this module is the only place that writes the table.
//
// Codes are per JAR: minted in bulk when a pack run is created, one per unit
// packed, and linked to an order line later when the packer scans the jar.

const prisma = require("../config/prisma");
const { generateTraceCode } = require("./traceCode");

// Upper bound per mint. Far above any real run; it exists so a typo like
// 480000 cannot sit generating codes for a minute.
const MAX_CODES_PER_MINT = 10000;

// Collision attempts before giving up. At 30^12 possible codes a single
// collision is already vanishingly unlikely, so this is a guard against a
// broken entropy source returning the same bytes forever, not a retry budget.
const MAX_ROUNDS = 5;

/**
 * Mint `count` fresh codes against a pack run.
 *
 * Inserts in one statement with duplicates skipped, then reads back which of
 * the generated codes actually landed on this run. Any shortfall (a code that
 * collided with an existing row) is regenerated and inserted again. Collisions
 * are effectively impossible, but the loop makes the function honest about
 * returning exactly `count` codes rather than assuming it.
 *
 * @param {number} packRunId
 * @param {number} count
 * @param {object} [client] - a Prisma transaction client, when minting as part
 *   of a larger transaction (e.g. creating the run itself).
 * @returns {Promise<string[]>} the codes created, in no particular order.
 */
async function mintCodes(packRunId, count, client = prisma) {
  const wanted = Number(count);
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > MAX_CODES_PER_MINT) {
    throw new Error(
      `Can mint between 1 and ${MAX_CODES_PER_MINT} codes at a time, not ${count}.`
    );
  }

  const minted = [];

  for (let round = 1; round <= MAX_ROUNDS && minted.length < wanted; round++) {
    const shortfall = wanted - minted.length;
    const batch = new Set();
    while (batch.size < shortfall) batch.add(generateTraceCode());
    const candidates = [...batch];

    await client.trace_codes.createMany({
      data: candidates.map((code) => ({ code, pack_run_id: packRunId })),
      // A collision with a code on another run is skipped rather than failing
      // the whole insert; the read-back below finds the gap.
      skipDuplicates: true,
    });

    const landed = await client.trace_codes.findMany({
      where: { code: { in: candidates }, pack_run_id: packRunId },
      select: { code: true },
    });
    for (const row of landed) minted.push(row.code);
  }

  if (minted.length < wanted) {
    throw new Error(
      `Minted ${minted.length} of ${wanted} codes after ${MAX_ROUNDS} rounds — entropy source may be broken.`
    );
  }

  return minted;
}

/**
 * Record the dispatch date for an order.
 *
 * Only fills an empty dispatched_at, so a partially-fulfilled order (which
 * fires orders/fulfilled once per fulfillment) keeps the date it FIRST went
 * out rather than having it overwritten by each later shipment.
 *
 * @param {string} shopifyOrderId
 * @param {Date} dispatchedAt
 * @returns {Promise<boolean>} true if this call set the date.
 */
async function markOrderDispatched(shopifyOrderId, dispatchedAt) {
  const result = await prisma.shopify_orders.updateMany({
    where: { shopify_order_id: String(shopifyOrderId), dispatched_at: null },
    data: { dispatched_at: dispatchedAt },
  });
  return result.count > 0;
}

module.exports = { mintCodes, markOrderDispatched, MAX_CODES_PER_MINT };
