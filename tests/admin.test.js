// Tests for the admin API's auth gate.
//
// These are the checks that must never regress: the admin API can create and
// delete the provenance records behind every trace page, and it is reachable
// with the same JWT_SECRET the public storefront signs customer tokens with.
// The ONLY thing separating a shopper from it is the `typ: "staff"` claim.
//
// Runs fully in-process with NO database — requireStaff rejects before any
// controller touches Prisma, which is exactly the property being asserted.

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

function request(method, path, { token, body } = {}) {
  const data = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request(
      base + path,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
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

const sign = (payload, secret = process.env.JWT_SECRET) =>
  jwt.sign(payload, secret, { expiresIn: "1h" });

// A token exactly as authController issues one for a shopper.
const customerToken = () =>
  sign({ userId: 1, email: "shopper@example.com", first_name: "Shopper" });

const staffToken = (role = "staff") =>
  sign({ staffId: 1, email: "s@crownandleaf.uk", name: "S", role, typ: "staff" });

// Every admin surface, so a newly added route can't quietly skip the gate.
const ADMIN_ROUTES = [
  ["GET", "/api/admin/estates"],
  ["POST", "/api/admin/estates"],
  ["GET", "/api/admin/factories"],
  ["POST", "/api/admin/factories"],
  ["GET", "/api/admin/lots"],
  ["POST", "/api/admin/lots"],
  ["GET", "/api/admin/pack-runs"],
  ["POST", "/api/admin/pack-runs"],
  ["GET", "/api/admin/pack-runs/by-code/PRT-A"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/orders/123/allocations"],
  ["POST", "/api/admin/orders/123/allocations"],
];

test("no token -> 401 on every admin route", async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await request(method, path);
    assert.strictEqual(res.status, 401, `${method} ${path}`);
  }
});

test("a valid CUSTOMER token -> 403 on every admin route", async () => {
  // The critical one. A shopper's token is correctly signed and passes
  // `protect`; only the missing `typ` claim stops it here.
  const token = customerToken();
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await request(method, path, { token });
    assert.strictEqual(res.status, 403, `${method} ${path} let a customer in`);
  }
});

test("a staff token signed with the WRONG secret -> 401", async () => {
  const forged = sign({ staffId: 9, typ: "staff", role: "admin" }, "wrong-secret");
  const res = await request("GET", "/api/admin/estates", { token: forged });
  assert.strictEqual(res.status, 401);
});

test("a token claiming typ=staff but signed correctly IS admitted past the gate", async () => {
  // Sanity check in the other direction: the gate must not reject everything.
  // 500 here is fine (no database in tests) — what matters is it is not 401/403.
  const res = await request("GET", "/api/admin/estates", { token: staffToken() });
  assert.notStrictEqual(res.status, 401);
  assert.notStrictEqual(res.status, 403);
});

test("role=staff cannot reach customer PII; role=admin can", async () => {
  const asStaff = await request("GET", "/api/admin/orders/123/customer", {
    token: staffToken("staff"),
  });
  assert.strictEqual(asStaff.status, 403);

  const asAdmin = await request("GET", "/api/admin/orders/123/customer", {
    token: staffToken("admin"),
  });
  assert.notStrictEqual(asAdmin.status, 403);
});

test("a customer token is rejected by /staff/auth/me", async () => {
  const res = await request("GET", "/api/staff/auth/me", {
    token: customerToken(),
  });
  assert.strictEqual(res.status, 403);
});

test("staff login validates its input", async () => {
  const res = await request("POST", "/api/staff/auth/login", {
    body: { email: "not-an-email" },
  });
  assert.strictEqual(res.status, 400);
  assert.ok(Array.isArray(res.body.errors));
});

test("there is no staff signup endpoint", async () => {
  // Privileged accounts are created by scripts/createStaffUser.js only. If a
  // signup route ever appears, this fails loudly.
  for (const path of ["/api/staff/auth/signup", "/api/staff/signup"]) {
    const res = await request("POST", path, {
      body: { email: "x@y.co", password: "p", name: "n", role: "admin" },
    });
    assert.notStrictEqual(res.status, 200, `${path} exists`);
    assert.notStrictEqual(res.status, 201, `${path} exists`);
  }
});

test("the legacy supply-chain endpoints are gone", async () => {
  // They were unused, unprotected by anything but a customer login, and are
  // dropped. A customer token must not resurrect them.
  const token = customerToken();
  for (const path of [
    "/api/plantation",
    "/api/field",
    "/api/factory",
    "/api/batch",
    "/api/product",
    "/api/inventory",
    "/api/location",
  ]) {
    const res = await request("GET", path, { token });
    assert.strictEqual(res.status, 404, `${path} still responds`);
  }
});
