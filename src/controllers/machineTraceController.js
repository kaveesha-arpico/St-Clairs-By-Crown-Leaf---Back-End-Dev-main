// machineTraceController.js
// POST /api/machine/orders/:id/traceability (TeaMatrix Addendum 2 §5).
//
// The machine prints a QR on every bottle it makes; the QR holds a link to the
// public trace page for that bottle. For website orders it also posts the same
// link here, once per bottle, so the customer can open it from their order
// page. We store it and show it; we never create or change trace data.
//
// Kept separate from the status endpoint on purpose: a repeated status is
// answered "200, no change", so a trace riding on a late `completed` would be
// dropped silently. Here a trace can arrive in any machine_status except `new`,
// including `completed` and `rejected` (some units made before the rest were
// rejected), and a retry of the same trace is a harmless 200.

const prisma = require("../config/prisma");
const { validateTraceLink } = require("../lib/traceLinkRules");

const SCHEMA_VERSION = 1;

function fail(res, status, code, message) {
  return res
    .status(status)
    .json({ schema_version: SCHEMA_VERSION, error_code: code, message });
}

const sid = (v) => (v === null || v === undefined ? null : String(v));

const postTraceability = async (req, res) => {
  const rawId = req.params.id;
  if (!/^\d+$/.test(String(rawId))) {
    return fail(res, 404, "NOT_FOUND", "Unknown machine order id.");
  }
  const id = BigInt(rawId);

  // 1. Row not found -> 404
  const row = await prisma.machine_orders.findUnique({
    where: { id },
    select: { id: true, units: true, machine_status: true },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Unknown machine order id.");

  // 2. The machine never received this line -> 409
  if (row.machine_status === "new") {
    return fail(res, 409, "NOT_RECEIVED", "The machine has not received this line (machine_status is new).");
  }

  // 3. Shape of the trace link -> 422, naming the field
  const check = validateTraceLink(req.body || {}, row.units);
  if (!check.ok) {
    return fail(res, 422, "INVALID_TRACE", `${check.field}: ${check.message}`);
  }
  const { unit_index, trace_id, url, machine_ref } = check.value;

  const reply = (stored) =>
    res.status(200).json({
      schema_version: SCHEMA_VERSION,
      id: sid(row.id),
      unit_index,
      trace_id,
      stored,
    });

  // 4 / 5. Already something for this unit?
  const forUnit = await prisma.machine_order_traces.findUnique({
    where: { machine_order_id_unit_index: { machine_order_id: id, unit_index } },
    select: { trace_id: true, url: true },
  });
  if (forUnit) {
    if (forUnit.trace_id === trace_id && forUnit.url === url) return reply(false); // safe retry
    return fail(res, 409, "TRACE_EXISTS", `Unit ${unit_index} already has a different trace.`);
  }
  // 5. This trace_id used on another unit?
  const byId = await prisma.machine_order_traces.findUnique({
    where: { trace_id },
    select: { id: true },
  });
  if (byId) {
    return fail(res, 409, "TRACE_EXISTS", "This trace_id is already stored for another bottle.");
  }

  // 6. Insert the trace and its event row together.
  try {
    await prisma.$transaction([
      prisma.machine_order_traces.create({
        data: { machine_order_id: id, unit_index, trace_id, url, machine_ref },
      }),
      prisma.machine_order_events.create({
        data: {
          machine_order_id: id,
          kind: "trace",
          from_status: null,
          to_status: "trace_added",
          detail: `unit ${unit_index}: ${trace_id}`,
        },
      }),
    ]);
  } catch (err) {
    // Two retries racing: the loser hits a unique constraint. Re-read and
    // answer as rule 4 or 5 would have.
    if (err.code === "P2002") {
      const now = await prisma.machine_order_traces.findUnique({
        where: { machine_order_id_unit_index: { machine_order_id: id, unit_index } },
        select: { trace_id: true, url: true },
      });
      if (now && now.trace_id === trace_id && now.url === url) return reply(false);
      return fail(res, 409, "TRACE_EXISTS", "A different trace was stored for this bottle concurrently.");
    }
    throw err;
  }

  return reply(true);
};

module.exports = { postTraceability };
