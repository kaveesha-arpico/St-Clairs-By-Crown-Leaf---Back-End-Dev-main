// Guest order lookup — the public POST /api/orders/lookup. No database: these
// pin the shape checks, the public mounting, and that it is NOT swallowed by
// the staff gate that guards the rest of /api/orders.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-webhook-secret";
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

function post(path, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request(base + path, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => { let p; try { p = JSON.parse(buf); } catch { p = buf; } resolve({ status: res.statusCode, body: p }); });
    });
    req.write(data);
    req.end();
  });
}

test("lookup is public: no token is never 401/403 (staff gate on /api/orders must not catch it)", async () => {
  const res = await post("/api/orders/lookup", { order_number: "#1042", email: "a@b.co" });
  // 500 without a database is fine; 401/403 would mean the route is gated.
  assert.notStrictEqual(res.status, 401);
  assert.notStrictEqual(res.status, 403);
});

test("missing or malformed fields -> 400 with the standard errors array", async () => {
  for (const body of [{}, { order_number: "#1042" }, { email: "a@b.co" }, { order_number: "#1042", email: "not-an-email" }, { order_number: 1042, email: "a@b.co" }]) {
    const res = await post("/api/orders/lookup", body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.ok(Array.isArray(res.body.errors), JSON.stringify(body));
  }
});

test("the rest of /api/orders is still staff-only", async () => {
  const res = await post("/api/orders", { anything: true });
  assert.strictEqual(res.status, 401);
});
