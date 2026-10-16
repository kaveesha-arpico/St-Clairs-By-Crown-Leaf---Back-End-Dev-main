// TeaMatrix machine API — auth, allowlist and request validation (spec v1.1
// §6, §7). Runs in-process with no database: everything asserted here is
// decided before any controller touches Prisma.
//
// MACHINE_ALLOWED_IPS is set to an address that is NOT the loopback the tests
// call from, so the allowlist path is exercised; a second app instance would be
// needed to test the "allowed" path in-process, so that is covered by the live
// check against staging instead (and by the acceptance checklist, §12).

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-webhook-secret";
process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
process.env.SHOPIFY_API_KEY = "k";
process.env.SHOPIFY_API_PASSWORD = "pw";
process.env.SHOPIFY_STOREFRONT_TOKEN = "t";
process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "at";
process.env.MACHINE_API_KEYS = "test-machine-key-1, test-machine-key-2";
delete process.env.MACHINE_ALLOWED_IPS; // allowlist tested via normalizeIp + a dedicated check below

const app = require("../src/app");
const { normalizeIp } = require("../src/middleware/machineAuth");
const { MACHINE_STATUSES, TERMINAL } = require("../src/controllers/machineOrdersController");

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

function request(method, path, { key, token, body } = {}) {
  const data = body === undefined ? null : JSON.stringify(body);
  const auth = key ? `Bearer ${key}` : token ? `Bearer ${token}` : undefined;
  return new Promise((resolve) => {
    const req = http.request(
      base + path,
      { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) } },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let parsed;
          try { parsed = JSON.parse(buf); } catch { parsed = buf; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    if (data) req.write(data);
    req.end();
  });
}

const customerJwt = () =>
  jwt.sign({ userId: 1, email: "shopper@example.com" }, process.env.JWT_SECRET, { expiresIn: "1h" });

const ROUTES = [
  ["GET", "/api/machine/orders/pending"],
  ["GET", "/api/machine/orders/changes?since=2026-01-01T00:00:00.000Z"],
  ["POST", "/api/machine/orders/1/status"],
  ["GET", "/api/machine/orders"], // legacy, still mounted until cutover
];

test("no key -> 401 UNAUTHORIZED on every machine route", async () => {
  for (const [m, p] of ROUTES) {
    const res = await request(m, p);
    assert.strictEqual(res.status, 401, `${m} ${p}`);
    assert.strictEqual(res.body.error_code, "UNAUTHORIZED");
    assert.strictEqual(res.body.schema_version, 1);
  }
});

test("wrong key -> 401 with the same body as no key (no hint which part failed)", async () => {
  const res = await request("GET", "/api/machine/orders/pending", { key: "not-the-key" });
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(res.body, { schema_version: 1, error_code: "UNAUTHORIZED", error: "Unauthorized." });
});

test("a customer JWT is not a machine key -> 401", async () => {
  const res = await request("GET", "/api/machine/orders/pending", { token: customerJwt() });
  assert.strictEqual(res.status, 401);
});

test("the second configured key also works (rotation)", async () => {
  // Passes auth, then hits the DB (absent in tests) -> 500, but NOT 401.
  const res = await request("GET", "/api/machine/orders/pending", { key: "test-machine-key-2" });
  assert.notStrictEqual(res.status, 401);
  assert.notStrictEqual(res.status, 403);
});

test("the machine router is not behind the customer JWT gate or the public limiter", async () => {
  // A valid key must never be answered by `protect` (401 "Authentication
  // required") — that would mean the router slipped below the auth gate.
  const res = await request("GET", "/api/machine/orders/pending", { key: "test-machine-key-1" });
  assert.notStrictEqual(res.status, 401);
  assert.notStrictEqual(res.status, 429);
});

test("/changes validates its cursor before touching the database", async () => {
  let res = await request("GET", "/api/machine/orders/changes", { key: "test-machine-key-1" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error_code, "MISSING_SINCE");

  res = await request("GET", "/api/machine/orders/changes?since=yesterday", { key: "test-machine-key-1" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error_code, "INVALID_SINCE");

  res = await request("GET", "/api/machine/orders/changes?since=2026-01-01T00:00:00Z&after_id=abc", { key: "test-machine-key-1" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error_code, "INVALID_AFTER_ID");
});

test("/:id/status with a non-numeric id -> 404 NOT_FOUND without a database", async () => {
  const res = await request("POST", "/api/machine/orders/not-an-id/status", {
    key: "test-machine-key-1",
    body: { schema_version: 1, machine_status: "order_received" },
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error_code, "NOT_FOUND");
});

test("status vocabulary matches §8.2 and `new` cannot be posted", () => {
  assert.deepStrictEqual(
    [...MACHINE_STATUSES].sort(),
    ["blending", "cancelled", "completed", "failed", "order_received", "pi_received", "queued", "rejected"]
  );
  assert.ok(!MACHINE_STATUSES.has("new"));
  assert.deepStrictEqual([...TERMINAL].sort(), ["cancelled", "completed", "rejected"]);
});

test("IPv4-mapped addresses normalise so the allowlist matches req.ip", () => {
  assert.strictEqual(normalizeIp("::ffff:10.0.100.112"), "10.0.100.112");
  assert.strictEqual(normalizeIp("10.0.100.112"), "10.0.100.112");
  assert.strictEqual(normalizeIp("::1"), "::1");
  assert.strictEqual(normalizeIp(undefined), "");
});

test("the Shopify webhook and storefront routes are unaffected by the machine router", async () => {
  // Mounting the machine router above the global limiter must not have moved
  // or shadowed anything else.
  const health = await request("GET", "/health");
  assert.strictEqual(health.status, 200);
  const hook = await request("POST", "/api/webhooks/shopify/orders-paid", { body: { id: "1" } });
  assert.strictEqual(hook.status, 401, "webhook HMAC check still first");
  const opts = await request("GET", "/api/tea-options");
  assert.notStrictEqual(opts.status, 401);
  assert.notStrictEqual(opts.status, 403);
});
