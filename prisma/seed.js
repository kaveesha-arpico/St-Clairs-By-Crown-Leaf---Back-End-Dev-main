// seed.js
// Reference data for the custom-blend lookup tables that GET /api/tea-options
// reads from. Run with `npm run db:seed` (or `npx prisma db seed`).
//
// Idempotent: only inserts names that aren't already present, so it is safe to
// re-run against an existing database. `name` has no unique constraint, so this
// filters in application code rather than using upsert.

const prisma = require("../src/config/prisma");

// The "base tea" options are the tea estates the blend builder offers, matching
// the estates set up as Custom Blend Tea variants in Shopify. (The table is
// still named base_teas; the values are estates.)
const BASE_TEAS = [
  "Lakshapana",
  "Maskeliya",
  "Moray",
  "Glentilt",
  "Strathpey",
];

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
