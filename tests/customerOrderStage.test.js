// Customer-facing stage for a custom-blend line, derived from machine_status
// and payment_status. Pure function, no database.

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = "test";

const { blendStage, STAGES } = require("../src/lib/customerOrderStage");

const stage = (machine_status, payment_status = "paid") => blendStage({ machine_status, payment_status }).stage;

test("every machine status maps to one of the four customer stages", () => {
  assert.strictEqual(stage("new"), "received");
  assert.strictEqual(stage("order_received"), "received");
  assert.strictEqual(stage("pi_received"), "received");
  assert.strictEqual(stage("queued"), "received");
  assert.strictEqual(stage("blending"), "being_made");
  assert.strictEqual(stage("failed"), "being_made", "a failed run is retried, so the customer still sees it in progress");
  assert.strictEqual(stage("completed"), "ready");
  assert.strictEqual(stage("rejected"), "cancelled");
  assert.strictEqual(stage("cancelled"), "cancelled");
});

test("payment state wins: cancelled or refunded is cancelled whatever the machine did", () => {
  assert.strictEqual(stage("completed", "cancelled"), "cancelled");
  assert.strictEqual(stage("blending", "refunded"), "cancelled");
  assert.strictEqual(stage("new", "cancelled"), "cancelled");
  // A partial refund is not a cancellation.
  assert.strictEqual(stage("completed", "partially_refunded"), "ready");
  assert.strictEqual(stage("new", "pending"), "received");
});

test("unknown or missing values degrade to received, never throw", () => {
  assert.strictEqual(blendStage({}).stage, "received");
  assert.strictEqual(blendStage(null).stage, "received");
  assert.strictEqual(stage("something_new"), "received");
});

test("each stage carries a display label", () => {
  for (const s of ["received", "being_made", "ready", "cancelled"]) {
    assert.ok(typeof STAGES[s] === "string" && STAGES[s].length > 0, s);
  }
  assert.strictEqual(blendStage({ machine_status: "completed", payment_status: "paid" }).label, "Ready");
});
