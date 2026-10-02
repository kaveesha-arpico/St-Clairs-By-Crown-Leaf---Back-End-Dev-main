// Tests for traceability code generation and the QR endpoint.
//
// Like smoke.test.js these run fully in-process and need NO database and no
// real Shopify credentials: code generation is pure, and the QR route performs
// no database lookup by design.

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");
const QRCode = require("qrcode");

// Test env: must be set before requiring the app.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-webhook-secret";
process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
process.env.SHOPIFY_API_KEY = "k";
process.env.SHOPIFY_API_PASSWORD = "pw";
process.env.SHOPIFY_STOREFRONT_TOKEN = "t";
process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "at";
process.env.TRACE_BASE_URL = "https://tea-details.example.test";

const {
  generateTraceCode,
  normalizeTraceCode,
  isValidTraceCode,
  ALPHABET,
  CODE_LENGTH,
} = require("../src/lib/traceCode");
const {
  extractDispatchedAt,
} = require("../src/controllers/shopifyWebhookController");
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

function request(method, path, { headers = {}, raw } = {}) {
  return new Promise((resolve) => {
    const req = http.request(base + path, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer: Buffer.concat(chunks),
        })
      );
    });
    if (raw) req.write(raw);
    req.end();
  });
}

// ---- Code generation ----

test("generated codes are 12 characters from the expected alphabet", () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateTraceCode();
    assert.strictEqual(code.length, CODE_LENGTH);
    for (const char of code) {
      assert.ok(ALPHABET.includes(char), `unexpected character ${char}`);
    }
  }
});

test("codes never contain visually confusable characters", () => {
  // 0/O and 1/I/L are the classic transcription errors; U is excluded to avoid
  // accidental obscenities (the Crockford rationale).
  const banned = ["0", "1", "I", "L", "O", "U"];
  const sample = Array.from({ length: 2000 }, generateTraceCode).join("");
  for (const char of banned) {
    assert.ok(!sample.includes(char), `code alphabet leaked "${char}"`);
  }
});

test("codes do not repeat across a large sample", () => {
  const seen = new Set();
  for (let i = 0; i < 50000; i++) seen.add(generateTraceCode());
  assert.strictEqual(seen.size, 50000, "generated a duplicate code");
});

test("every alphabet symbol is reachable (no off-by-one in sampling)", () => {
  const seen = new Set(Array.from({ length: 5000 }, generateTraceCode).join(""));
  assert.strictEqual(seen.size, ALPHABET.length);
});

// ---- Validation / normalization ----

test("normalization accepts codes as a human would type them", () => {
  assert.strictEqual(normalizeTraceCode("k7m2-qp9x tr4b"), "K7M2QP9XTR4B");
  assert.strictEqual(normalizeTraceCode("  K7M2QP9XTR4B  "), "K7M2QP9XTR4B");
  assert.strictEqual(normalizeTraceCode(null), "");
});

test("validation rejects wrong length and out-of-alphabet characters", () => {
  assert.ok(isValidTraceCode("K7M2QP9XTR4B"));
  assert.ok(!isValidTraceCode("K7M2QP9XTR4"), "11 chars should fail");
  assert.ok(!isValidTraceCode("K7M2QP9XTR4BZ"), "13 chars should fail");
  assert.ok(!isValidTraceCode("K7M2QP9XTR4O"), "O is not in the alphabet");
  assert.ok(!isValidTraceCode("K7M2QP9XTR40"), "0 is not in the alphabet");
  assert.ok(
    !isValidTraceCode("k7m2qp9xtr4b"),
    "lowercase must be normalized first"
  );
  assert.ok(!isValidTraceCode(12345678901), "non-strings are rejected");
});

// ---- Dispatch date extraction ----

test("dispatch date is the earliest fulfillment, not the latest", () => {
  const result = extractDispatchedAt({
    fulfillments: [
      { created_at: "2026-03-05T10:00:00Z" },
      { created_at: "2026-03-01T09:00:00Z" },
      { created_at: "2026-03-09T11:00:00Z" },
    ],
  });
  assert.strictEqual(result.toISOString(), "2026-03-01T09:00:00.000Z");
});

test("dispatch date falls back when fulfillments are missing or unusable", () => {
  assert.strictEqual(
    extractDispatchedAt({ updated_at: "2026-03-02T08:00:00Z" }).toISOString(),
    "2026-03-02T08:00:00.000Z"
  );
  assert.strictEqual(
    extractDispatchedAt({
      fulfillments: [{ created_at: "not-a-date" }],
      updated_at: "2026-03-02T08:00:00Z",
    }).toISOString(),
    "2026-03-02T08:00:00.000Z"
  );
  assert.ok(extractDispatchedAt({}) instanceof Date, "always yields a Date");
});

// ---- QR endpoint ----

test("QR renders a PNG for a valid code", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.png");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers["content-type"], "image/png");
  // PNG magic number.
  assert.deepStrictEqual(
    res.buffer.subarray(0, 4),
    Buffer.from([0x89, 0x50, 0x4e, 0x47])
  );
});

test("QR renders an SVG for a valid code", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.svg");
  assert.strictEqual(res.status, 200);
  assert.match(res.headers["content-type"], /image\/svg\+xml/);
  assert.match(res.buffer.toString("utf8"), /^<\?xml|^<svg/);
});

test("QR encodes exactly <TRACE_BASE_URL>/<CODE>", async () => {
  // Re-encode the URL we expect and compare bytes, which pins the encoded
  // content without needing a QR decoder.
  const expected = await QRCode.toBuffer(
    "https://tea-details.example.test/K7M2QP9XTR4B",
    { errorCorrectionLevel: "Q", margin: 4, width: 512, type: "png" }
  );
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.png");
  assert.deepStrictEqual(res.buffer, expected);
});

test("QR accepts a lowercase, hyphenated code and normalizes it", async () => {
  const canonical = await request("GET", "/api/qr/K7M2QP9XTR4B.png");
  const messy = await request("GET", "/api/qr/k7m2-qp9x-tr4b.png");
  assert.strictEqual(messy.status, 200);
  assert.deepStrictEqual(messy.buffer, canonical.buffer);
});

test("QR honours a clamped size parameter", async () => {
  const small = await request("GET", "/api/qr/K7M2QP9XTR4B.png?size=128");
  const large = await request("GET", "/api/qr/K7M2QP9XTR4B.png?size=1024");
  assert.strictEqual(small.status, 200);
  assert.strictEqual(large.status, 200);
  assert.ok(large.buffer.length > small.buffer.length);

  // Out-of-range and garbage sizes fall back rather than erroring.
  for (const size of ["999999", "-5", "abc"]) {
    const res = await request("GET", `/api/qr/K7M2QP9XTR4B.png?size=${size}`);
    assert.strictEqual(res.status, 200, `size=${size} should still render`);
  }
});

test("QR response is cacheable forever", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.png");
  assert.match(res.headers["cache-control"] || "", /immutable/);
});

test("QR rejects a malformed code -> 400", async () => {
  // Contains "O", which is not in the alphabet.
  const res = await request("GET", "/api/qr/K7M2QP9XTR4O.png");
  assert.strictEqual(res.status, 400);
});

test("QR rejects an unsupported format -> 400", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.jpg");
  assert.strictEqual(res.status, 400);
});

test("QR requires an extension -> 400", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B");
  assert.strictEqual(res.status, 400);
});

test("QR is public - no token required", async () => {
  const res = await request("GET", "/api/qr/K7M2QP9XTR4B.png");
  assert.notStrictEqual(res.status, 401);
});

// ---- orders/fulfilled webhook ----

// Synthetic order id for the webhook tests. These assert only that HMAC
// verification is reached, but a valid signature means the handler runs for
// real — so when a dev database happens to be reachable it writes an order and
// a trace code (the pre-existing payment-webhook test in smoke.test.js behaves
// the same way). The id is deliberately outside Shopify's real id range so the
// row is obvious and safe to delete.
const TEST_ORDER_ID = "900000000000000001";

test("orders-fulfilled webhook without HMAC -> 401", async () => {
  const res = await request("POST", "/api/webhooks/shopify/orders-fulfilled", {
    headers: { "Content-Type": "application/json" },
    raw: JSON.stringify({ id: TEST_ORDER_ID }),
  });
  assert.strictEqual(res.status, 401);
});

test("orders-fulfilled webhook with valid HMAC passes verification", async () => {
  const payload = JSON.stringify({ id: TEST_ORDER_ID, fulfillments: [] });
  const hmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(Buffer.from(payload))
    .digest("base64");
  const res = await request("POST", "/api/webhooks/shopify/orders-fulfilled", {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac,
    },
    raw: payload,
  });
  // Passes HMAC, then hits the DB (absent in tests) -> 500, but NOT 401.
  assert.notStrictEqual(res.status, 401);
});
