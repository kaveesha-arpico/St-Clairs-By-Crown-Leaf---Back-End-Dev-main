// Tests for the public trace endpoint's refusal behaviour.
//
// This is the only unauthenticated endpoint that reads from the order tables,
// so what it REFUSES to do matters more than what it returns. These run
// in-process with no database: every case below is rejected before any query.

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

function get(path) {
  return new Promise((resolve) => {
    http.get(base + path, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
  });
}

test("the endpoint is public — no token required", async () => {
  const res = await get("/api/trace/ZZZZZZZZZZZZ");
  assert.notStrictEqual(res.status, 401);
});

test("a malformed code is refused without reaching the database", async () => {
  // No DB is running under test, so a query would surface as 500. A clean 404
  // proves the rejection happened before any lookup — which is also what stops
  // this endpoint being a cheap way to generate database load.
  for (const bad of [
    "NOTACODE",            // too short
    "TOOMANYCHARACTERS11", // too long
    "ZZZZZZZZZZZO",        // contains O
    "ZZZZZZZZZZZI",        // contains I
    "ZZZZZZZZZZZL",        // contains L
    "ZZZZZZZZZZZ0",        // contains 0
    "ZZZZZZZZZZZ1",        // contains 1
    "....!!!!....",        // punctuation
  ]) {
    const res = await get(`/api/trace/${encodeURIComponent(bad)}`);
    assert.strictEqual(res.status, 404, `${bad} should 404, got ${res.status}`);
  }
});

test("every refusal returns the identical body", async () => {
  // A revoked code, an unknown code and a malformed one must be
  // indistinguishable, or the endpoint confirms which codes are real.
  const a = await get("/api/trace/NOTACODE");
  const b = await get("/api/trace/ZZZZZZZZZZZZ");
  assert.deepStrictEqual(a.body, b.body);
  assert.strictEqual(a.body.verified, false);
});

test("the refusal body leaks nothing about the code format", async () => {
  const res = await get("/api/trace/NOTACODE");
  const text = JSON.stringify(res.body);
  // No alphabet, no length, no "invalid format" hint for someone probing.
  assert.ok(!/alphabet|12|length|format|character/i.test(text), text);
  // And it must not echo the attempted code back.
  assert.ok(!text.includes("NOTACODE"), text);
});

test("the response carries no personal-data keys", async () => {
  const res = await get("/api/trace/ZZZZZZZZZZZZ");
  const text = JSON.stringify(res.body);
  for (const key of ["email", "first_name", "last_name", "address", "phone"]) {
    assert.ok(!text.includes(key), `response mentions ${key}`);
  }
});

test("a trailing-slash or empty code does not reach the handler", async () => {
  const res = await get("/api/trace/");
  assert.notStrictEqual(res.status, 500, "empty code should not error");
});
