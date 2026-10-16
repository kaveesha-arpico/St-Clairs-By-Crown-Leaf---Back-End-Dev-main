// Zero-downtime rotation of the Shopify webhook secret (spec v1.1 §9.2).
// SHOPIFY_WEBHOOK_SECRET holds "new,old" during cutover; a delivery signed with
// either must verify, anything else must not. No database needed: the HMAC
// check runs before any handler.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SHOPIFY_WEBHOOK_SECRET = "new-secret , old-secret"; // spaces tolerated
process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
process.env.SHOPIFY_API_KEY = "k";
process.env.SHOPIFY_API_PASSWORD = "pw";
process.env.SHOPIFY_STOREFRONT_TOKEN = "t";
process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "at";

const app = require("../src/app");

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

const sign = (raw, secret) =>
  crypto.createHmac("sha256", secret).update(Buffer.from(raw)).digest("base64");

const PAYLOAD = JSON.stringify({ id: "900000000000000001", cancelled_at: "2026-10-16T09:00:00Z" });
const PATH = "/api/webhooks/shopify/orders-cancelled";

test("a delivery signed with the NEW secret passes HMAC", async () => {
  const res = await post(PATH, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "new-secret") });
  assert.notStrictEqual(res.status, 401); // 500 without a DB is fine; 401 is not
});

test("a delivery signed with the OLD secret still passes during cutover", async () => {
  const res = await post(PATH, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "old-secret") });
  assert.notStrictEqual(res.status, 401);
});

test("a delivery signed with any other secret is rejected", async () => {
  const res = await post(PATH, PAYLOAD, { "X-Shopify-Hmac-Sha256": sign(PAYLOAD, "leaked-secret") });
  assert.strictEqual(res.status, 401);
});

test("a tampered body fails even with a once-valid signature", async () => {
  const sig = sign(PAYLOAD, "new-secret");
  const res = await post(PATH, PAYLOAD.replace("cancelled_at", "cancelled_AT"), { "X-Shopify-Hmac-Sha256": sig });
  assert.strictEqual(res.status, 401);
});

test("no signature header -> 401", async () => {
  const res = await post(PATH, PAYLOAD);
  assert.strictEqual(res.status, 401);
});
