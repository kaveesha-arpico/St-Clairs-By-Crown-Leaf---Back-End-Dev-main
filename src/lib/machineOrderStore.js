// machineOrderStore.js
// Writes the TeaMatrix machine_orders / machine_order_events tables from a
// Shopify order webhook (spec v1.1 §4, §5). Called INSIDE the transaction that
// upserts shopify_orders, so an order and its machine rows commit together.
//
// Division of labour, which the machine relies on:
//   - webhooks write payment_status (forward-only) and, on first sight of a
//     line, the frozen recipe;
//   - the machine writes machine_status, machine_ref, machine_status_reason —
//     and ONLY through the status endpoint. Nothing here ever touches them, so
//     a retried or late webhook can never reset the machine's progress.

const { parseBlendId, blendRef } = require("./blendRef");
const {
  derivePaymentStatus,
  paymentStatusAdvances,
  customBlendProductId,
  isCustomBlendLine,
  isTestOrder,
  customerDisplayName,
  buildRecipe,
} = require("./machineOrderRules");

const BLEND_ID_KEY = /^blend[\s_-]*id$/i;

function blendIdProperty(item) {
  const props = Array.isArray(item.properties) ? item.properties : [];
  const match = props.find((p) => p && BLEND_ID_KEY.test(String(p.name || "")));
  return match && match.value != null ? String(match.value) : null;
}

/**
 * Upsert one machine_orders row per custom-blend line on the order.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {object} payload  the parsed Shopify order (ids as strings)
 * @param {{ now?: Date, log?: Console }} [opts]
 */
async function syncMachineOrders(tx, payload, opts = {}) {
  const productId = customBlendProductId();
  if (!productId) return; // custom blends not configured -> nothing is a blend

  const now = opts.now || new Date();
  const log = opts.log || console;
  const lines = Array.isArray(payload.line_items) ? payload.line_items : [];
  const blendLines = lines.filter((item) => isCustomBlendLine(item, productId));
  if (blendLines.length === 0) return;

  const orderId = String(payload.id);
  const nextPayment = derivePaymentStatus(payload);
  if (!nextPayment) {
    log.warn(
      `[machine_orders] order ${orderId}: unrecognised financial_status ` +
        `"${payload.financial_status}" — keeping current payment_status.`
    );
  }
  const isTest = isTestOrder(payload);

  for (const item of blendLines) {
    const lineId = String(item.id);
    const existing = await tx.machine_orders.findUnique({
      where: { shopify_line_item_id: lineId },
      select: { id: true, payment_status: true, paid_at: true, validation_error: true },
    });

    if (!existing) {
      // ---- first sight of this line: freeze the recipe (§5.2 step 2, §5.3) ----
      const ref = blendIdProperty(item);
      let blendId = null;
      let validationError = null;
      let recipe = null;
      let totalWeightG = null;
      let blendRefOut = ref;

      if (!ref) {
        validationError = "MISSING_BLEND_ID";
      } else {
        const id = parseBlendId(ref);
        const blend = Number.isInteger(id) && id > 0
          ? await tx.custom_blends.findUnique({
              where: { id },
              include: {
                base_teas: { select: { code: true, name: true } },
                blend_spices: { include: { spices: { select: { code: true, name: true } } } },
              },
            })
          : null;
        const built = buildRecipe(blend);
        recipe = built.recipe;
        totalWeightG = built.totalWeightG;
        validationError = built.validationError;
        if (blend) {
          blendId = blend.id;
          blendRefOut = blendRef(blend.id, blend.created_at);
        }
      }

      const initialPayment = nextPayment || "pending";
      const created = await tx.machine_orders.create({
        data: {
          shopify_order_id: orderId,
          shopify_line_item_id: lineId,
          order_number: payload.name ? String(payload.name).slice(0, 32) : null,
          blend_id: blendId,
          blend_ref: blendRefOut ? String(blendRefOut).slice(0, 32) : null,
          customer_display_name: customerDisplayName(payload),
          units: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
          total_weight_g: totalWeightG,
          recipe_json: recipe,
          validation_error: validationError,
          is_test: isTest,
          payment_status: initialPayment,
          payment_status_updated_at: now,
          paid_at: initialPayment === "paid" ? now : null,
        },
        select: { id: true },
      });
      await tx.machine_order_events.create({
        data: {
          machine_order_id: created.id,
          kind: "payment",
          from_status: null,
          to_status: initialPayment,
          detail: validationError ? `validation_error=${validationError}` : null,
        },
      });

      if (validationError && initialPayment === "paid" && !isTest) {
        // §5.3: a paid blend the machine cannot make needs a human. Loud, so it
        // shows up in the container log; nobody else would notice otherwise.
        log.error(
          `[machine_orders] ALERT paid order ${payload.name || orderId} line ${lineId} ` +
            `has validation_error=${validationError} (blend ref ${ref || "none"}) — needs follow-up.`
        );
      }
      continue;
    }

    // ---- seen before: only the payment status may move, and only forward ----
    if (!paymentStatusAdvances(existing.payment_status, nextPayment)) continue;

    await tx.machine_orders.update({
      where: { id: existing.id },
      data: {
        payment_status: nextPayment,
        payment_status_updated_at: now,
        paid_at: existing.paid_at || (nextPayment === "paid" ? now : null),
      },
    });
    await tx.machine_order_events.create({
      data: {
        machine_order_id: existing.id,
        kind: "payment",
        from_status: existing.payment_status,
        to_status: nextPayment,
        detail: null,
      },
    });

    if (nextPayment === "paid" && existing.validation_error && !isTest) {
      log.error(
        `[machine_orders] ALERT paid order ${payload.name || orderId} line ${lineId} ` +
          `has validation_error=${existing.validation_error} — needs follow-up.`
      );
    }
  }
}

module.exports = { syncMachineOrders };
