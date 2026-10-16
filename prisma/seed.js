// seed.js
// Reference data for the custom-blend lookup tables that GET /api/tea-options
// reads from. Run with `npm run db:seed` (or `npx prisma db seed`).
//
// Idempotent and non-destructive. Rows are matched on `code`, the permanent
// identifier the TeaMatrix machine uses to recognise an ingredient — never on
// `name`, which is display text and may be reworded. Re-running inserts any
// missing codes and reconciles name + is_active on the listed rows. It never
// deletes or renumbers rows: custom_blends / blend_spices reference them by id
// (ON DELETE RESTRICT), so retiring an ingredient means `is_active: false`.
//
// The 12 codes below are the agreed TeaMatrix catalogue (spec v1.1 §2). A code
// never changes once shipped and is never reused.

const prisma = require("../src/config/prisma");

// Base teas: an estate plus a grade. The NAME is what the storefront resolves
// to a Custom Blend Tea variant on Shopify (matched by name) and what's written
// onto the order as the "Base Tea" attribute — so it must match the Shopify
// variant names exactly. The CODE is what the machine matches on.
const BASE_TEAS = [
  { code: "STRATHSPEY_BOPF", name: "Strathspey BOPF", is_active: true },
  { code: "LAXAPANA_PEKOE", name: "Laxapana PEKOE", is_active: true },
  { code: "MORAY_BOP", name: "Moray BOP", is_active: true },
  { code: "MASKELIYA_SILVER_TIPS", name: "Maskeliya Silver Tips", is_active: true },
  { code: "GLENTILT_GOLDEN_TIPS", name: "Glentilt Golden Tips", is_active: true },
];

// Blend ingredients. "Spices" is a misnomer — the list includes peels and
// flowers. They live in one list on purpose: GET /tea-options returns
// { baseTeas, spices } and the frontend destructures exactly those two keys.
//
// Only these 7 are offered. Older rows (Cardamom, Clove, Black Pepper, Nutmeg,
// Star Anise, Fennel, Peppermint) were retired with is_active=false and keep
// their ids in existing databases for historical recipes; they are deliberately
// NOT listed here so a fresh seed never brings them back. Bergamot is absent
// because it is a liquid flavouring dosed on a finished blend, not a proportion
// of it, so it cannot be expressed as { id, percentage }.
const SPICES = [
  { code: "CINNAMON_CHIPS", name: "Cinnamon", is_active: true },
  { code: "GINGER_PIECES", name: "Ginger", is_active: true },
  { code: "ORANGE_PEEL", name: "Orange Peel", is_active: true },
  { code: "LEMON_PEEL", name: "Lemon Peel", is_active: true },
  { code: "LEMONGRASS", name: "Lemongrass", is_active: true },
  { code: "ROSE_PETALS", name: "Rose Petals", is_active: true },
  { code: "JASMINE_PETALS", name: "Jasmine Petals", is_active: true },
];

// Insert any missing codes, then reconcile name + is_active on every listed row
// so re-running brings the DB to the declared state without deleting rows.
async function seedTable(model, label, items) {
  const existing = await model.findMany({ select: { code: true } });
  const present = new Set(existing.map((row) => row.code));
  const missing = items.filter((i) => !present.has(i.code));

  if (missing.length > 0) {
    await model.createMany({
      data: missing.map((i) => ({
        code: i.code,
        name: i.name,
        is_active: i.is_active,
      })),
    });
  }

  let reconciled = 0;
  for (const i of items) {
    const res = await model.updateMany({
      where: { code: i.code },
      data: { name: i.name, is_active: i.is_active },
    });
    reconciled += res.count;
  }

  const activeCount = items.filter((i) => i.is_active).length;
  console.log(
    `${label}: ${present.size + missing.length} rows ` +
      `(inserted ${missing.length}, ${activeCount} active) — reconciled ${reconciled}`
  );
}

async function main() {
  await seedTable(prisma.base_teas, "base_teas", BASE_TEAS);
  await seedTable(prisma.spices, "spices", SPICES);
}

// Exported so tests can check the catalogue without a database.
module.exports = { BASE_TEAS, SPICES };

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
