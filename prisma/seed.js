// seed.js
// Reference data for the custom-blend lookup tables that GET /api/tea-options
// reads from. Run with `npm run db:seed` (or `npx prisma db seed`).
//
// Idempotent: only inserts names that aren't already present, so it is safe to
// re-run against an existing database. `name` has no unique constraint, so this
// filters in application code rather than using upsert.

const prisma = require("../src/config/prisma");

// The "base tea" options the blend builder offers, matching the variants set up
// on the Custom Blend Tea product in Shopify (the storefront resolves a chosen
// base tea to a variant by NAME, so these strings must match Shopify exactly).
//
// Mixed kinds by design: the first five are estates, Silver Tips and Golden
// Tips are grades. The frontend treats every entry as a selectable base
// regardless of kind, so they share one list.
//
// Spellings here are the corrected ones. Databases seeded before
// 20260831000000_fix_base_tea_spellings hold "Lakshapana"/"Strathpey"; that
// migration renames them in place. Always run migrations BEFORE this seed —
// seeding first would insert the corrected names as new rows rather than
// renaming the old ones.
const BASE_TEAS = [
  "Laxapana",
  "Maskeliya",
  "Moray",
  "Glentilt",
  "Strathspey",
  "Silver Tips",
  "Golden Tips",
];

// "Spices" is a misnomer now — the last four are peels and flowers. They live
// in this list on purpose: GET /tea-options returns { baseTeas, spices } and the
// frontend destructures exactly those two keys, so a separate category would be
// silently ignored and a rename would break the blend builder outright.
//
// Bergamot deliberately absent: it is a liquid flavouring dosed on top of a
// finished blend, not a proportion of it, so it cannot be expressed as
// { id, percentage }. The frontend carries it as descriptive copy instead.
const SPICES = [
  "Cardamom",
  "Ginger",
  "Cinnamon",
  "Clove",
  "Black Pepper",
  "Nutmeg",
  "Star Anise",
  "Fennel",
  "Lemongrass",
  "Peppermint",
  "Orange Peel",
  "Lemon Peel",
  "Rose Petals",
  "Jasmine Petals",
];

async function seedTable(model, label, names) {
  const existing = await model.findMany({ select: { name: true } });
  const present = new Set(existing.map((row) => row.name));
  const missing = names.filter((name) => !present.has(name));

  if (missing.length === 0) {
    console.log(`${label}: already up to date (${present.size} rows)`);
    return;
  }

  await model.createMany({ data: missing.map((name) => ({ name })) });
  console.log(`${label}: inserted ${missing.length} (${missing.join(", ")})`);
}

async function main() {
  await seedTable(prisma.base_teas, "base_teas", BASE_TEAS);
  await seedTable(prisma.spices, "spices", SPICES);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
