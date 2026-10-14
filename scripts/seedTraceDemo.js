#!/usr/bin/env node
// seedTraceDemo.js
// Creates a complete, realistic traceability scenario for development: an
// estate, a factory, two lots, three pack runs WITH THEIR JAR CODES, product
// details, and a test Shopify order half-packed with real jar codes.
//
// Why this exists: orders normally arrive from a Shopify webhook, so a fresh
// development database has nothing to pack and nothing to trace. Without this
// the frontend has no way to exercise the packing screen, the label printing
// or the trace page.
//
// Usage (from the project root, or inside the backend container):
//   node scripts/seedTraceDemo.js            # create (or refresh) the demo data
//   node scripts/seedTraceDemo.js --clean    # remove it again
//
// Everything it creates is prefixed DEMO- / "Demo " so --clean can find it and
// so nobody mistakes it for real production data.
//
// The order is left DELIBERATELY HALF-PACKED: line 1 (Golden Tips x3) has
// three jars scanned in — two from one run and one from another, so both
// packed dates appear — and line 2 (Moray BOP x1) has none. One Golden Tips
// jar is left on the shelf, unlinked, so the "order: null" trace page can be
// seen too.

require("dotenv").config();
const prisma = require("../src/config/prisma");
const { mintCodes } = require("../src/lib/traceCodeStore");

// Outside Shopify's real id range, so a demo row can never collide with a real
// order arriving from a webhook.
const ORDER_ID = "999000000000000001";
const LINE_GOLDEN = "999000000000000101";
const LINE_SECOND = "999000000000000102";
const PRODUCT_GOLDEN = "999000000000000201";
const PRODUCT_SECOND = "999000000000000202";

const PREFIX = { pack: "DEMO-PR-", lot: "DEMO-LOT-", name: "Demo " };

async function clean() {
  // Deleting the order cascades to its line items; jars in them are set back
  // to unlinked by the FK, and then go with their pack runs below.
  await prisma.shopify_orders.deleteMany({ where: { shopify_order_id: ORDER_ID } });
  await prisma.pack_runs.deleteMany({ where: { pack_run_code: { startsWith: PREFIX.pack } } });
  await prisma.lots.deleteMany({ where: { lot_number: { startsWith: PREFIX.lot } } });
  await prisma.estates.deleteMany({ where: { name: { startsWith: PREFIX.name } } });
  await prisma.factories.deleteMany({ where: { name: { startsWith: PREFIX.name } } });
  await prisma.product_trace_info.deleteMany({
    where: { shopify_product_id: { in: [PRODUCT_GOLDEN, PRODUCT_SECOND] } },
  });
}

async function seed() {
  // Re-runnable: clear any previous demo data first so ids and codes are fresh
  // rather than accumulating duplicates.
  await clean();

  const estate = await prisma.estates.create({
    data: { name: "Demo Glentilt Estate", region: "Dimbula" },
  });
  const factory = await prisma.factories.create({
    data: { name: "Demo Glentilt Factory" },
  });

  const lotGT = await prisma.lots.create({
    data: {
      lot_number: "DEMO-LOT-GT-038",
      estate_id: estate.estate_id,
      factory_id: factory.factory_id,
      grade: "Golden Tips",
    },
  });
  const lotBOP = await prisma.lots.create({
    data: {
      lot_number: "DEMO-LOT-BOP-012",
      estate_id: estate.estate_id,
      factory_id: factory.factory_id,
      grade: "Moray BOP",
    },
  });

  // Each run mints one code per jar. Small counts here so the label PDF and
  // the codes list are readable; a real run would be dozens or hundreds.
  async function run(code, lot, date, product, sku, qty) {
    const created = await prisma.pack_runs.create({
      data: {
        pack_run_code: code,
        lot_id: lot.lot_id,
        packed_date: new Date(date),
        shopify_product_id: product,
        sku,
        quantity_packed: qty,
      },
    });
    const codes = await mintCodes(created.pack_run_id, qty);
    return { ...created, codes: codes.sort() };
  }

  // Two Golden Tips runs from the SAME lot on different days, so an order line
  // can be filled from both and show two packed dates.
  const runA = await run("DEMO-PR-0412", lotGT, "2026-03-12", PRODUCT_GOLDEN, "GT-100", 3);
  const runB = await run("DEMO-PR-0498", lotGT, "2026-03-19", PRODUCT_GOLDEN, "GT-100", 6);
  const runC = await run("DEMO-PR-0550", lotBOP, "2026-03-15", PRODUCT_SECOND, "BOP-250", 4);

  await prisma.product_trace_info.createMany({
    data: [
      {
        shopify_product_id: PRODUCT_GOLDEN,
        title: "Glentilt Golden Tips",
        ingredients: "Pure Ceylon black tea",
        package_weight_g: 100,
        product_url: "https://crownandleaf.uk/products/golden-tips",
      },
      // Deliberately NO title, ingredients or reorder link on the second
      // product, so the frontend can see what missing details render as.
      { shopify_product_id: PRODUCT_SECOND, package_weight_g: 250 },
    ],
  });

  await prisma.shopify_orders.create({
    data: {
      shopify_order_id: ORDER_ID,
      order_number: "#DEMO1043",
      email: "demo-customer@example.com",
      financial_status: "paid",
      fulfillment_status: null,
      currency: "GBP",
      total_amount: "48.00",
      shopify_created_at: new Date(),
      dispatched_at: new Date("2026-03-20T09:14:00Z"),
    },
  });

  await prisma.shopify_order_line_items.createMany({
    data: [
      {
        line_item_id: LINE_GOLDEN,
        shopify_order_id: ORDER_ID,
        product_id: PRODUCT_GOLDEN,
        title: "Glentilt Golden Tips",
        variant_title: "100g",
        sku: "GT-100",
        quantity: 3,
        price: "12.00",
      },
      {
        line_item_id: LINE_SECOND,
        shopify_order_id: ORDER_ID,
        product_id: PRODUCT_SECOND,
        title: "Moray BOP",
        variant_title: "250g",
        sku: "BOP-250",
        quantity: 1,
        price: "12.00",
      },
    ],
  });

  // Pack line 1: two jars from run A, one from run B. Run A's third jar stays
  // on the shelf (order: null on its trace page). Line 2 is left unpacked.
  const packed = [runA.codes[0], runA.codes[1], runB.codes[0]];
  const shelf = runA.codes[2];
  await prisma.trace_codes.updateMany({
    where: { code: { in: packed } },
    data: { line_item_id: LINE_GOLDEN, allocated_at: new Date() },
  });

  const base = (process.env.TRACE_BASE_URL || "").replace(/\/+$/, "");

  console.log(`
Demo traceability data created.

  Estate       Demo Glentilt Estate (Dimbula)      id ${estate.estate_id}
  Factory      Demo Glentilt Factory               id ${factory.factory_id}
  Lots         DEMO-LOT-GT-038  (Golden Tips)      id ${lotGT.lot_id}
               DEMO-LOT-BOP-012 (Moray BOP)        id ${lotBOP.lot_id}

  Pack runs (each minted one code per jar):
    DEMO-PR-0412  GT-100   2026-03-12   id ${runA.pack_run_id}   3 jars: ${runA.codes.join(" ")}
    DEMO-PR-0498  GT-100   2026-03-19   id ${runB.pack_run_id}   6 jars: ${runB.codes.join(" ")}
    DEMO-PR-0550  BOP-250  2026-03-15   id ${runC.pack_run_id}   4 jars: ${runC.codes.join(" ")}

  Order        #DEMO1043                           id ${ORDER_ID}
    line 1     Glentilt Golden Tips  x3   FULLY PACKED  jars ${packed.join(", ")}
    line 2     Moray BOP             x1   NOT PACKED    <- scan any DEMO-PR-0550 jar here

Try:
  Jar in an order     GET /api/trace/${packed[0]}
  Jar on the shelf    GET /api/trace/${shelf}      (order: null)
  Labels for a run    GET /api/admin/pack-runs/${runB.pack_run_id}/labels.pdf
  Codes on a run      GET /api/admin/pack-runs/${runB.pack_run_id}/codes
  Packing state       GET /api/admin/orders/${ORDER_ID}/allocations
  Find order by jar   GET /api/admin/orders?code=${packed[0]}
${base ? `\n  Scanned URL         ${base}/${packed[0]}\n` : ""}
Scanning a Golden Tips jar (from 0412/0498) against line 2 is REJECTED with
400 product_mismatch. Scanning ${packed[0]} again anywhere is REJECTED with
400 code_already_used. Both are deliberate, so you can exercise the error paths.

Remove it all again with:  node scripts/seedTraceDemo.js --clean
`);
}

async function main() {
  const wantsClean = process.argv.includes("--clean");

  // This writes test rows, which have no business on a live store. Production
  // needs an explicit override rather than a quiet success.
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error(
      "\nRefusing to run against NODE_ENV=production.\n" +
        "This creates demo orders and trace codes. If you really mean to, pass --force.\n"
    );
    process.exit(1);
  }

  if (wantsClean) {
    await clean();
    console.log("\nDemo traceability data removed.\n");
    return;
  }

  await seed();
}

main()
  .catch((err) => {
    console.error("\nSeed failed:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
