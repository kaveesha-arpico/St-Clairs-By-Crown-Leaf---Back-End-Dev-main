// Trace-link validation for the TeaMatrix traceability endpoint (Addendum 2
// §3, §5 rule 3 and the acceptance checklist). Pure functions, no database.

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = "test";
process.env.TRACE_URL_HOSTS = "trace.crownandleaf.uk";

const { validateTraceLink, traceUrlHosts } = require("../src/lib/traceLinkRules");

const good = { unit_index: 1, trace_id: "7Kq2xM9a", url: "https://trace.crownandleaf.uk/t/7Kq2xM9a", machine_ref: "vm108:online_orders:88" };
const ok = (input, units = 1) => {
  const r = validateTraceLink(input, units);
  assert.strictEqual(r.ok, true, `${JSON.stringify(input)} -> ${r.field}: ${r.message}`);
  return r.value;
};
const bad = (input, field, units = 1) => {
  const r = validateTraceLink(input, units);
  assert.strictEqual(r.ok, false, `${JSON.stringify(input)} should fail on ${field}`);
  assert.strictEqual(r.field, field, `${JSON.stringify(input)} failed on ${r.field}, expected ${field}`);
};

test("a valid trace link passes and is normalised", () => {
  assert.deepStrictEqual(ok(good), { ...good });
  const noRef = ok({ ...good, machine_ref: undefined });
  assert.strictEqual(noRef.machine_ref, null);
});

test("unit_index must be an integer from 1 to the line's units", () => {
  bad({ ...good, unit_index: 0 }, "unit_index");
  bad({ ...good, unit_index: 2 }, "unit_index", 1);
  ok({ ...good, unit_index: 2 }, 2);
  bad({ ...good, unit_index: 3 }, "unit_index", 2);
  bad({ ...good, unit_index: "1" }, "unit_index");
  bad({ ...good, unit_index: 1.5 }, "unit_index");
});

test("trace_id: 8 to 12 letters/digits, case preserved", () => {
  bad({ ...good, trace_id: "7Kq2xM9" }, "trace_id"); // 7 chars
  bad({ ...good, trace_id: "7Kq2xM9a7Kq2x" }, "trace_id"); // 13 chars
  bad({ ...good, trace_id: "7Kq2-M9a" }, "trace_id"); // outside [A-Za-z0-9]
  ok({ ...good, trace_id: "7Kq2xM9a7Kq2" }); // 12 chars
  assert.strictEqual(ok({ ...good, trace_id: "7KQ2XM9A" }).trace_id, "7KQ2XM9A", "case must not be folded");
});

test("url: https only, at most 255 chars, on an allowed host", () => {
  bad({ ...good, url: "http://trace.crownandleaf.uk/t/7Kq2xM9a" }, "url");
  bad({ ...good, url: "https://evil.example/t/7Kq2xM9a" }, "url");
  bad({ ...good, url: "https://trace.crownandleaf.uk.evil.example/t/x" }, "url");
  bad({ ...good, url: "not a url" }, "url");
  bad({ ...good, url: "https://trace.crownandleaf.uk/t/" + "a".repeat(240) }, "url");
  ok({ ...good, url: "https://TRACE.crownandleaf.uk/t/7Kq2xM9a" }); // host compare is case-insensitive
});

test("the allowed hosts come from TRACE_URL_HOSTS, comma-separated, and nothing passes when unset", () => {
  process.env.TRACE_URL_HOSTS = " trace.crownandleaf.uk , trace-uat.crownandleaf.uk ";
  try {
    assert.deepStrictEqual(traceUrlHosts(), ["trace.crownandleaf.uk", "trace-uat.crownandleaf.uk"]);
    ok({ ...good, url: "https://trace-uat.crownandleaf.uk/t/7Kq2xM9a" });
  } finally {
    process.env.TRACE_URL_HOSTS = "trace.crownandleaf.uk";
  }
  delete process.env.TRACE_URL_HOSTS;
  try {
    bad(good, "url"); // fail closed, never "allow any host"
  } finally {
    process.env.TRACE_URL_HOSTS = "trace.crownandleaf.uk";
  }
});
