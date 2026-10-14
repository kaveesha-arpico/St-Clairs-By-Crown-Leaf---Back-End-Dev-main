// traceController.js
// The public traceability endpoint — what a scanned jar's QR actually opens.
//
// A code identifies ONE JAR. It resolves to the pack run the jar came out of
// (and so its lot, estate, factory and packed date), the product's details, and
// — only once the jar has been scanned into an online order — that order's
// number and dispatch date. A jar on a shelf, sold in a shop or given as a gift
// has no order, and that is a normal state, not an error.
//
// This is the only endpoint in the system that is unauthenticated, reachable by
// anyone with a code, and reads from the order tables. Three rules shape it:
//
//  1. NO PERSONAL DATA LEAVES HERE. Every field is picked explicitly rather
//     than spreading a row, so a column added later cannot silently appear.
//  2. UNKNOWN AND REVOKED CODES ARE INDISTINGUISHABLE. Same status, same body.
//     A different answer for "revoked" would confirm that a code is real.
//  3. IT NEVER EXPLAINS ITSELF. No hints about code format.

const prisma = require("../config/prisma");
const { normalizeTraceCode, isValidTraceCode } = require("../lib/traceCode");
const { toDateOnly } = require("../lib/dates");

// Grades visible on the public page, comma-separated, e.g. "Golden Tips".
// UNSET MEANS NO GATING. Largely redundant now that only jars from runs staff
// deliberately entered carry a code at all, but kept so a run of a non-pilot
// grade can be recorded without its jars going public before they are ready.
function pilotGrades() {
  return (process.env.TRACE_PILOT_GRADES || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
}

function notFound(res) {
  return res
    .status(404)
    .json({ verified: false, message: "We couldn't find that code." });
}

// GET /api/trace/:code
exports.getTrace = async (req, res) => {
  const code = normalizeTraceCode(req.params.code);

  // Reject malformed codes with the same response a real miss gets, and
  // without touching the database.
  if (!isValidTraceCode(code)) return notFound(res);

  const jar = await prisma.trace_codes.findUnique({
    where: { code },
    select: {
      code: true,
      status: true,
      pack_run: {
        select: {
          packed_date: true,
          shopify_product_id: true,
          sku: true,
          lot: {
            select: {
              grade: true,
              estate: { select: { name: true, region: true } },
              factory: { select: { name: true } },
            },
          },
        },
      },
      line_item: {
        select: {
          title: true,
          variant_title: true,
          // Deliberately NOT selecting email; there is no name or address
          // column on the order at all. See rule 1 above.
          order: { select: { order_number: true, dispatched_at: true } },
        },
      },
    },
  });

  if (!jar || jar.status !== "active") return notFound(res);

  // Count the scan — one statement so concurrent scans can't lose one, and
  // COALESCE so first_scanned_at only ever records the FIRST.
  await prisma.$executeRaw`
    UPDATE trace_codes
       SET scan_count = scan_count + 1,
           first_scanned_at = COALESCE(first_scanned_at, NOW())
     WHERE code = ${code}`;

  // Read the counters back rather than predicting them: first_scanned_at is
  // DATETIME(0), so the stored value is whole seconds while JavaScript's clock
  // carries milliseconds, and a guess would not match what was recorded.
  const counters = await prisma.trace_codes.findUnique({
    where: { code },
    select: { scan_count: true, first_scanned_at: true },
  });

  const grades = pilotGrades();
  const grade = jar.pack_run.lot.grade;
  if (grades.length > 0 && !(grade && grades.includes(grade.toLowerCase()))) {
    // A real jar whose grade is not yet public: verified, but no provenance.
    return res.status(200).json({
      verified: true,
      code: jar.code,
      traced: false,
      first_scanned_at: counters.first_scanned_at,
      scan_count: counters.scan_count,
    });
  }

  const info = jar.pack_run.shopify_product_id
    ? await prisma.product_trace_info.findUnique({
        where: { shopify_product_id: jar.pack_run.shopify_product_id },
      })
    : null;

  // Title: the saved display name first; the order line's title if the jar is
  // in an order and nothing is saved; otherwise nothing.
  const title =
    (info && info.title) ||
    (jar.line_item && jar.line_item.title) ||
    null;

  return res.status(200).json({
    verified: true,
    code: jar.code,
    traced: true,
    product: {
      title,
      variant_title: jar.line_item ? jar.line_item.variant_title : null,
      ingredients: info ? info.ingredients : null,
      package_weight_g: info ? info.package_weight_g : null,
      product_url: info ? info.product_url : null,
    },
    plantation: {
      name: jar.pack_run.lot.estate.name,
      region: jar.pack_run.lot.estate.region,
    },
    factory: jar.pack_run.lot.factory.name,
    packed_date: toDateOnly(jar.pack_run.packed_date),
    grade,
    // null until the jar is scanned into an online order.
    order: jar.line_item
      ? {
          order_number: jar.line_item.order.order_number,
          dispatched_at: jar.line_item.order.dispatched_at,
        }
      : null,
    first_scanned_at: counters.first_scanned_at,
    scan_count: counters.scan_count,
  });
};
