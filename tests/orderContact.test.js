// The contact side channel (src/lib/orderContactStore.js and the
// /api/webhooks/shopify/order-contact route).
//
// Background: app-route order webhooks arrive without email/customer on the
// shop's Shopify plan; the store-route webhooks still carry them but are
// signed with the exposed shared secret. So that secret is accepted on ONE
// route that may only fill in a missing email / display name. These tests pin
// both halves: the route accepts only its own secret, and the store logic can
// never create or alter anything else. No database: the store is exercised
// against an in-memory fake of the Prisma transaction client.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SHOPIFY_WEBHOOK_SECRET = "app-secret";
process.env.SHOPIFY_CONTACT_WEBHOOK_SECRET = "store-secret";
process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
process.env.SHOPIFY_API_KEY = "k";
process.env.SHOPIFY_API_PASSWORD = "pw";
process.env.SHOPIFY_STOREFRONT_TOKEN = "t";
process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "at";
process.env.CUSTOM_BLEND_PRODUCT_ID = "777";

const app = require("../src/app");
const {
  contactFromPayload,
  applyOrderContact,
  fillOrderFromContact,
  normalizeEmail,
} = require("../src/lib/orderContactStore");
const { syncMachineOrders } = require("../src/lib/machineOrderStore");

// ---- HTTP: which secret opens which door ----------------------------------

let server;
let base;
test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});
test.after(() => server && server.close());

function post(path, raw, headers = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      base + path,
      { method: "POST", headers: { "Content-Type": "application/json", ...headers } },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
      }
    );
    req.write(raw);
    req.end();
  });
}
const sign = (raw, secret) => crypto.createHmac("sha256", secret).update(Buffer.from(raw)).digest("base64");
const PAYLOAD = JSON.stringify({ id: "900000000000000002", email: "a@b.test" });
const CONTACT = "/api/webhooks/shopify/order-contact";
const ORDERS = "/api/webhooks/shopify/orders-paid";

test("order-contact accepts the store secret", async () => {
  const res = await post(CONTACT, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "store-secret") });
  assert.notStrictEqual(res.status, 401); // 500 without a DB is fine; 401 is not
});

test("order-contact REJECTS the app secret (the two routes do not share keys)", async () => {
  const res = await post(CONTACT, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "app-secret") });
  assert.strictEqual(res.status, 401);
});

test("the order-writing routes REJECT the store secret", async () => {
  const res = await post(ORDERS, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "store-secret") });
  assert.strictEqual(res.status, 401);
});

test("the order-writing routes still accept the app secret", async () => {
  const res = await post(ORDERS, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "app-secret") });
  assert.notStrictEqual(res.status, 401);
});

test("order-contact without a signature -> 401", async () => {
  const res = await post(CONTACT, PAYLOAD);
  assert.strictEqual(res.status, 401);
});

test("order-contact is 500 (fail closed) when its secret is not configured", async () => {
  const saved = process.env.SHOPIFY_CONTACT_WEBHOOK_SECRET;
  delete process.env.SHOPIFY_CONTACT_WEBHOOK_SECRET;
  try {
    const res = await post(CONTACT, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "store-secret") });
    assert.strictEqual(res.status, 500);
  } finally {
    process.env.SHOPIFY_CONTACT_WEBHOOK_SECRET = saved;
  }
});

// ---- pure extraction --------------------------------------------------------

test("contactFromPayload takes email and a short display name only", () => {
  const c = contactFromPayload({
    id: "123",
    email: "  Amal@Example.com ",
    updated_at: "2026-10-30T10:00:00Z",
    customer: { first_name: "Amal", last_name: "Perera", phone: "+94..." },
    shipping_address: { address1: "secret street" },
  });
  assert.deepStrictEqual(Object.keys(c).sort(), ["customer_display_name", "email", "shopify_order_id", "shopify_updated_at"]);
  assert.strictEqual(c.shopify_order_id, "123");
  assert.strictEqual(c.email, "Amal@Example.com");
  assert.strictEqual(c.customer_display_name, "Amal P.");
  assert.strictEqual(c.shopify_updated_at.toISOString(), "2026-10-30T10:00:00.000Z");
});

test("contactFromPayload falls back to contact_email and customer.email", () => {
  assert.strictEqual(contactFromPayload({ id: 1, contact_email: "x@y.z" }).email, "x@y.z");
  assert.strictEqual(contactFromPayload({ id: 1, customer: { email: "c@y.z" } }).email, "c@y.z");
});

test("contactFromPayload is null when there is no id or nothing to store", () => {
  assert.strictEqual(contactFromPayload(null), null);
  assert.strictEqual(contactFromPayload({ email: "a@b.c" }), null);
  assert.strictEqual(contactFromPayload({ id: 5 }), null);
  assert.strictEqual(contactFromPayload({ id: 5, email: "not-an-email" }), null);
});

test("normalizeEmail rejects junk and over-long values", () => {
  assert.strictEqual(normalizeEmail(" a@b.c "), "a@b.c");
  assert.strictEqual(normalizeEmail(""), null);
  assert.strictEqual(normalizeEmail(null), null);
  assert.strictEqual(normalizeEmail("x".repeat(260) + "@y.z"), null);
});

// ---- store logic against a fake transaction ---------------------------------

// Minimal in-memory stand-in for the Prisma tx client: just enough of
// updateMany / findUnique / upsert / create on the four tables involved, and a
// log of every call so the tests can assert what was and was NOT touched.
function fakeTx(seed = {}) {
  const db = {
    shopify_orders: new Map(Object.entries(seed.shopify_orders || {})),
    machine_orders: new Map(Object.entries(seed.machine_orders || {})),
    shopify_order_contacts: new Map(Object.entries(seed.shopify_order_contacts || {})),
    custom_blends: new Map(Object.entries(seed.custom_blends || {})),
    machine_order_events: [],
  };
  const calls = [];
  const matches = (row, where) =>
    Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
  const table = (name, key) => ({
    async findUnique({ where }) {
      calls.push([name, "findUnique"]);
      const k = where[key];
      if (k === undefined) {
        return [...db[name].values()].find((r) => matches(r, where)) || null;
      }
      return db[name].get(String(k)) || null;
    },
    async updateMany({ where, data }) {
      calls.push([name, "updateMany", where, data]);
      let count = 0;
      for (const row of db[name].values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
    async upsert({ where, update, create }) {
      calls.push([name, "upsert"]);
      const k = String(where[key]);
      if (db[name].has(k)) Object.assign(db[name].get(k), update);
      else db[name].set(k, { ...create });
      return db[name].get(k);
    },
    async create({ data }) {
      calls.push([name, "create"]);
      const id = BigInt(db[name].size + 1);
      const row = { id, ...data };
      db[name].set(String(data[key] ?? id), row);
      return row;
    },
    async update({ where, data }) {
      calls.push([name, "update"]);
      const row = [...db[name].values()].find((r) => matches(r, where));
      Object.assign(row, data);
      return row;
    },
  });
  const tx = {
    shopify_orders: table("shopify_orders", "shopify_order_id"),
    machine_orders: table("machine_orders", "shopify_line_item_id"),
    shopify_order_contacts: table("shopify_order_contacts", "shopify_order_id"),
    custom_blends: table("custom_blends", "id"),
    machine_order_events: { async create({ data }) { calls.push(["machine_order_events", "create"]); db.machine_order_events.push(data); } },
  };
  return { tx, db, calls };
}

const NOTE = { id: "1001", name: "#1047", email: "amal@example.com", updated_at: "2026-10-30T10:00:00Z", customer: { first_name: "Amal", last_name: "Perera" } };

test("order already here: fills the empty email and machine display name", async () => {
  const { tx, db } = fakeTx({
    shopify_orders: { 1001: { shopify_order_id: "1001", email: null, financial_status: "paid" } },
    machine_orders: { L1: { shopify_line_item_id: "L1", shopify_order_id: "1001", customer_display_name: null, payment_status: "paid", machine_status: "pi_received" } },
  });
  const r = await applyOrderContact(tx, NOTE);
  assert.deepStrictEqual(r, { stored: true, orders: 1, machineRows: 1 });
  assert.strictEqual(db.shopify_orders.get("1001").email, "amal@example.com");
  assert.strictEqual(db.machine_orders.get("L1").customer_display_name, "Amal P.");
  // untouched
  assert.strictEqual(db.shopify_orders.get("1001").financial_status, "paid");
  assert.strictEqual(db.machine_orders.get("L1").payment_status, "paid");
  assert.strictEqual(db.machine_orders.get("L1").machine_status, "pi_received");
});

test("order not here yet: the note is held in the drawer and NO order is created", async () => {
  const { tx, db, calls } = fakeTx();
  const r = await applyOrderContact(tx, NOTE);
  assert.deepStrictEqual(r, { stored: true, orders: 0, machineRows: 0 });
  assert.strictEqual(db.shopify_orders.size, 0);
  assert.strictEqual(db.machine_orders.size, 0);
  assert.strictEqual(db.shopify_order_contacts.get("1001").email, "amal@example.com");
  assert.ok(!calls.some(([t, op]) => t !== "shopify_order_contacts" && (op === "create" || op === "upsert")), "only the drawer may be written to");
});

test("never overwrites an email or name that is already set", async () => {
  const { tx, db } = fakeTx({
    shopify_orders: { 1001: { shopify_order_id: "1001", email: "real@example.com" } },
    machine_orders: { L1: { shopify_line_item_id: "L1", shopify_order_id: "1001", customer_display_name: "Real N." } },
  });
  const r = await applyOrderContact(tx, { ...NOTE, email: "attacker@evil.test", customer: { first_name: "Eve", last_name: "L" } });
  assert.deepStrictEqual(r, { stored: true, orders: 0, machineRows: 0 });
  assert.strictEqual(db.shopify_orders.get("1001").email, "real@example.com");
  assert.strictEqual(db.machine_orders.get("L1").customer_display_name, "Real N.");
});

test("only writes to the order id in the payload, never to other orders", async () => {
  const { tx, db } = fakeTx({
    shopify_orders: { 1001: { shopify_order_id: "1001", email: null }, 2002: { shopify_order_id: "2002", email: null } },
  });
  await applyOrderContact(tx, NOTE);
  assert.strictEqual(db.shopify_orders.get("1001").email, "amal@example.com");
  assert.strictEqual(db.shopify_orders.get("2002").email, null);
});

test("an OLDER redelivery does not overwrite a newer note in the drawer", async () => {
  const { tx, db } = fakeTx({
    shopify_order_contacts: { 1001: { shopify_order_id: "1001", email: "new@example.com", customer_display_name: "New N.", shopify_updated_at: new Date("2026-10-30T12:00:00Z") } },
  });
  const r = await applyOrderContact(tx, { ...NOTE, email: "old@example.com", updated_at: "2026-10-30T09:00:00Z" });
  assert.strictEqual(r.stored, false);
  assert.strictEqual(db.shopify_order_contacts.get("1001").email, "new@example.com");
});

test("a later delivery with the email blanked keeps the email already in the drawer", async () => {
  const { tx, db } = fakeTx({
    shopify_order_contacts: { 1001: { shopify_order_id: "1001", email: "keep@example.com", customer_display_name: null, shopify_updated_at: new Date("2026-10-30T09:00:00Z") } },
  });
  await applyOrderContact(tx, { id: "1001", updated_at: "2026-10-30T11:00:00Z", customer: { first_name: "Amal", last_name: "P" } });
  const row = db.shopify_order_contacts.get("1001");
  assert.strictEqual(row.email, "keep@example.com");
  assert.strictEqual(row.customer_display_name, "Amal P.");
});

test("a payload with nothing useful does nothing at all", async () => {
  const { tx, calls } = fakeTx();
  const r = await applyOrderContact(tx, { id: "1001", financial_status: "paid", line_items: [{ id: "L9" }] });
  assert.deepStrictEqual(r, { stored: false, orders: 0, machineRows: 0 });
  assert.strictEqual(calls.length, 0);
});

test("fillOrderFromContact is update-only and idempotent", async () => {
  const { tx, db } = fakeTx({ shopify_orders: { 1001: { shopify_order_id: "1001", email: null } } });
  const c = { shopify_order_id: "1001", email: "a@b.c", customer_display_name: "A B." };
  assert.deepStrictEqual(await fillOrderFromContact(tx, c), { orders: 1, machineRows: 0 });
  assert.deepStrictEqual(await fillOrderFromContact(tx, c), { orders: 0, machineRows: 0 });
  assert.strictEqual(db.shopify_orders.size, 1);
});

// ---- the app route picks the note up when the order lands later -------------

test("syncMachineOrders uses the drawer's display name when the payload has no customer", async () => {
  const { tx, db } = fakeTx({
    custom_blends: { 19: { id: 19, quantity: 50, base_tea_percentage: "80.00", created_at: new Date("2026-10-16T00:00:00Z"), base_teas: { code: "BOPF", name: "BOPF" }, blend_spices: [{ percentage: "20.00", spices: { code: "GINGER", name: "Ginger" } }] } },
  });
  const payload = {
    id: "1001", name: "#1047", financial_status: "paid",
    line_items: [{ id: "L1", product_id: "777", quantity: 1, properties: [{ name: "Blend ID", value: "BLEND-2026-000019" }] }],
    // no email, no customer, no addresses: what the app route delivers
  };
  await syncMachineOrders(tx, payload, { contact: { email: "amal@example.com", customer_display_name: "Amal P." }, log: { warn() {}, error() {} } });
  assert.strictEqual(db.machine_orders.get("L1").customer_display_name, "Amal P.");
  assert.strictEqual(db.machine_orders.get("L1").payment_status, "paid");
});

test("syncMachineOrders prefers the payload's own customer over the drawer", async () => {
  const { tx, db } = fakeTx({
    custom_blends: { 19: { id: 19, quantity: 50, base_tea_percentage: "80.00", created_at: new Date(), base_teas: { code: "BOPF", name: "BOPF" }, blend_spices: [{ percentage: "20.00", spices: { code: "GINGER", name: "Ginger" } }] } },
  });
  const payload = {
    id: "1001", financial_status: "paid", customer: { first_name: "Nimal", last_name: "S" },
    line_items: [{ id: "L1", product_id: "777", quantity: 1, properties: [{ name: "Blend ID", value: "19" }] }],
  };
  await syncMachineOrders(tx, payload, { contact: { customer_display_name: "Amal P." }, log: { warn() {}, error() {} } });
  assert.strictEqual(db.machine_orders.get("L1").customer_display_name, "Nimal S.");
});
