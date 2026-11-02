// orderContactStore.js
// The "contact side channel" for Shopify orders.
//
// Why this exists. Order webhooks are delivered through the custom app (signed
// with the app's own secret, see scripts/registerWebhooks.js). On the shop's
// current Shopify plan the app is denied "protected customer data", so those
// deliveries arrive with `email`, `customer` and the addresses stripped. The
// store-level webhooks (Settings -> Notifications) still carry them, but they
// are signed with the store's shared secret, which was exposed and cannot be
// regenerated. So the store-route deliveries are accepted on ONE route that is
// allowed to do exactly one thing: record the order's email and display name.
//
// What this module may do:
//   - upsert shopify_order_contacts (the "drawer");
//   - set shopify_orders.email where it is NULL;
//   - set machine_orders.customer_display_name where it is NULL.
// What it must never do, because the signing secret is not trusted:
//   - create a shopify_orders row, a line item or a machine row;
//   - change payment_status, financial_status, cancelled_at or anything the
//     machine acts on;
//   - overwrite an email or name that is already set.
//
// The order-writing path (persistOrder) reads the drawer, so it does not
// matter which delivery reaches us first.

const { customerDisplayName } = require("./machineOrderRules");

const EMAIL_MAX = 255;

function normalizeEmail(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s || s.length > EMAIL_MAX || !s.includes("@")) return null;
  return s;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Extract what the side channel is allowed to carry from a Shopify order
 * payload (ids as strings). Pure. Returns null when the payload has no id or
 * nothing worth storing.
 */
function contactFromPayload(payload) {
  if (!payload || payload.id === undefined || payload.id === null) return null;
  const email = normalizeEmail(
    payload.email ?? payload.contact_email ?? (payload.customer && payload.customer.email)
  );
  const name = customerDisplayName(payload);
  if (!email && !name) return null;
  return {
    shopify_order_id: String(payload.id).slice(0, 32),
    email,
    customer_display_name: name,
    shopify_updated_at: toDate(payload.updated_at),
  };
}

/**
 * Copy a stored contact onto the order rows that exist and lack it. Never
 * creates anything. Safe to call repeatedly.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ shopify_order_id: string, email?: string|null, customer_display_name?: string|null }} contact
 * @returns {Promise<{ orders: number, machineRows: number }>}
 */
async function fillOrderFromContact(tx, contact) {
  let orders = 0;
  let machineRows = 0;
  if (contact.email) {
    const r = await tx.shopify_orders.updateMany({
      where: { shopify_order_id: contact.shopify_order_id, email: null },
      data: { email: contact.email },
    });
    orders = r.count;
  }
  if (contact.customer_display_name) {
    const r = await tx.machine_orders.updateMany({
      where: { shopify_order_id: contact.shopify_order_id, customer_display_name: null },
      data: { customer_display_name: contact.customer_display_name },
    });
    machineRows = r.count;
  }
  return { orders, machineRows };
}

/**
 * Handle one store-route delivery: store the contact in the drawer and fill
 * the order if it is already here.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {object} payload  parsed Shopify order
 * @returns {Promise<{ stored: boolean, orders: number, machineRows: number }>}
 */
async function applyOrderContact(tx, payload) {
  const contact = contactFromPayload(payload);
  if (!contact) return { stored: false, orders: 0, machineRows: 0 };

  const existing = await tx.shopify_order_contacts.findUnique({
    where: { shopify_order_id: contact.shopify_order_id },
  });

  // A redelivery of an OLDER version of the order must not overwrite a newer
  // note. Equal or missing timestamps are applied (last write wins).
  const stale =
    existing &&
    existing.shopify_updated_at &&
    contact.shopify_updated_at &&
    contact.shopify_updated_at < existing.shopify_updated_at;

  let merged = contact;
  if (!stale) {
    // Fill-only on the drawer too: a later delivery with the email removed
    // (Shopify can blank it on an edited order) keeps what we already know.
    merged = {
      shopify_order_id: contact.shopify_order_id,
      email: contact.email || (existing && existing.email) || null,
      customer_display_name:
        contact.customer_display_name || (existing && existing.customer_display_name) || null,
      shopify_updated_at: contact.shopify_updated_at || (existing && existing.shopify_updated_at) || null,
    };
    await tx.shopify_order_contacts.upsert({
      where: { shopify_order_id: merged.shopify_order_id },
      update: {
        email: merged.email,
        customer_display_name: merged.customer_display_name,
        shopify_updated_at: merged.shopify_updated_at,
      },
      create: merged,
    });
  } else {
    merged = existing;
  }

  const filled = await fillOrderFromContact(tx, merged);
  return { stored: !stale, ...filled };
}

/**
 * Look up the drawer for an order about to be written by the app route.
 * @returns {Promise<{ email: string|null, customer_display_name: string|null }|null>}
 */
async function findOrderContact(tx, orderId) {
  const row = await tx.shopify_order_contacts.findUnique({
    where: { shopify_order_id: String(orderId) },
    select: { email: true, customer_display_name: true },
  });
  return row || null;
}

module.exports = {
  contactFromPayload,
  applyOrderContact,
  fillOrderFromContact,
  findOrderContact,
  normalizeEmail,
};
