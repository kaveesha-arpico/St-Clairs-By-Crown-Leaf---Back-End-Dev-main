// customerOrderStage.js
// Folds the machine's nine statuses and the payment status into the four
// stages a customer sees on their order page. The storefront never needs the
// machine vocabulary (spec v1.1 §8.2); it gets one of these plus a label.
//
//   received    paid, the shop has it, not started yet
//   being_made  the machine is working on it (or retrying after a failed run)
//   ready       blended; the shop will dispatch it
//   cancelled   cancelled or refunded in Shopify, or rejected by the shop
//
// Payment wins over machine state: a refunded order is "cancelled" for the
// customer even if the machine had already finished it.

const STAGES = Object.freeze({
  received: "Order received",
  being_made: "Being blended",
  ready: "Ready",
  cancelled: "Cancelled",
});

const CANCELLED_PAYMENT = new Set(["cancelled", "refunded"]);
const CANCELLED_MACHINE = new Set(["rejected", "cancelled"]);
const BEING_MADE = new Set(["blending", "failed"]);

/**
 * @param {{ payment_status?: string|null, machine_status?: string|null }} row
 * @returns {{ stage: string, label: string }}
 */
function blendStage(row) {
  const pay = row && row.payment_status;
  const mach = row && row.machine_status;

  if (CANCELLED_PAYMENT.has(pay) || CANCELLED_MACHINE.has(mach)) {
    return { stage: "cancelled", label: STAGES.cancelled };
  }
  if (mach === "completed") return { stage: "ready", label: STAGES.ready };
  if (BEING_MADE.has(mach)) return { stage: "being_made", label: STAGES.being_made };
  return { stage: "received", label: STAGES.received };
}

module.exports = { blendStage, STAGES };
