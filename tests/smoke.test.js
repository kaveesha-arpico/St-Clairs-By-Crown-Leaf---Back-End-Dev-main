// Smoke tests for middleware behaviour (auth gate, validation, error handling,
// webhook HMAC). These run fully in-process and do NOT require a database or
// real Shopify credentials — they assert behaviour that happens before any
// controller touches the DB.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

// Test env: must be set before requiring the app (Shopify client builds at load).
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

function request(method, path, { headers = {}, raw, body } = {}) {
  const data =
    raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
  return new Promise((resolve) => {
    const req = http.request(
      base + path,
      { method, headers: { "Content-Type": "application/json", ...headers } },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(buf);
          } catch {
            parsed = buf;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    if (data) req.write(data);
    req.end();
  });
}

const validToken = () =>
  jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: "1h" });

test("protected route without token -> 401", async () => {
  const res = await request("GET", "/api/plantation");
  assert.strictEqual(res.status, 401);
});

test("protected route with invalid token -> 401", async () => {
  const res = await request("GET", "/api/customers", {
    headers: { Authorization: "Bearer not.a.jwt" },
  });
  assert.strictEqual(res.status, 401);
});

test("protected route with valid token passes auth (not 401)", async () => {
  const res = await request("GET", "/api/customers", {
    headers: { Authorization: `Bearer ${validToken()}` },
  });
  assert.notStrictEqual(res.status, 401);
});

test("signup with invalid body -> 400 with standardized errors", async () => {
  const res = await request("POST", "/api/auth/signup", {
    body: { email: "bad" },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  assert.ok(Array.isArray(res.body.errors) && res.body.errors.length > 0);
});

test("signup with valid body passes validation (not 400)", async () => {
  const res = await request("POST", "/api/auth/signup", {
    body: { first_name: "A", last_name: "B", email: "a@b.co", password: "secret1" },
  });
  assert.notStrictEqual(res.status, 400);
});

test("login error response never leaks a raw error object", async () => {
  // Against a real DB this is 401 (no such user); with no DB it's 500.
  // Either way the response must never leak an internal `error` field.
  const res = await request("POST", "/api/auth/login", {
    body: { email: "nonexistent-smoke-test@example.com", password: "whatever" },
  });
  assert.ok(res.status === 401 || res.status === 500);
  assert.strictEqual(res.body.error, undefined);
});

test("malformed JSON -> 400 with friendly message", async () => {
  const res = await request("POST", "/api/auth/login", { raw: "{ not json " });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.message || "", /Invalid JSON/i);
});

test("bad :id param -> 400", async () => {
  const res = await request("GET", "/api/customers/abc", {
    headers: { Authorization: `Bearer ${validToken()}` },
  });
  assert.strictEqual(res.status, 400);
});

test("checkout with empty items -> 400", async () => {
  const res = await request("POST", "/api/checkout", { body: { items: [] } });
  assert.strictEqual(res.status, 400);
});

test("webhook without HMAC header -> 401", async () => {
  const res = await request("POST", "/api/payment-webhook", {
    body: { id: 1, cart_token: "abc" },
  });
  assert.strictEqual(res.status, 401);
});

test("webhook with invalid HMAC -> 401", async () => {
  const res = await request("POST", "/api/payment-webhook", {
    headers: { "X-Shopify-Hmac-Sha256": "wrong" },
    body: { id: 1, cart_token: "abc" },
  });
  assert.strictEqual(res.status, 401);
});

test("webhook with valid HMAC passes verification (not 401)", async () => {
  const payload = JSON.stringify({ id: 1, cart_token: "abc" });
  const hmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(Buffer.from(payload))
    .digest("base64");
  const res = await request("POST", "/api/payment-webhook", {
    headers: { "X-Shopify-Hmac-Sha256": hmac },
    raw: payload,
  });
  // Passes HMAC; then hits the DB (absent in tests) -> 500, but crucially NOT 401.
  assert.notStrictEqual(res.status, 401);
});
