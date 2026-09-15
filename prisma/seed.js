// seed.js
// Reference data for the custom-blend lookup tables that GET /api/tea-options
// reads from. Run with `npm run db:seed` (or `npx prisma db seed`).
//
// Idempotent and non-destructive: it inserts any missing names and reconciles
// the `is_active` flag on the listed rows. It never deletes or renumbers rows,
// because custom_blends / custom_orders reference them by id — retiring an
// option means marking it inactive, not removing it.

const prisma = require("../src/config/prisma");

// The "base tea" options the blend builder offers. Each combines an estate with
// a grade (e.g. "Moray BOP"). The NAME is what the storefront resolves to a
// Custom Blend Tea variant on Shopify (matched by name) and what's written onto
// the order as the "Base Tea" attribute — so these strings must match the
// Shopify variant names exactly.
const BASE_TEAS = [
  { name: "Strathspey BOPF", is_active: true },
  { name: "Maskeliya Silver Tips", is_active: true },
  { name: "Glentilt Golden Tips", is_active: true },
  { name: "Moray BOP", is_active: true },
  { name: "Laxapana PEKOE", is_active: true },
];

// Blend ingredients. Only the 7 active ones are OFFERED by the builder
// (GET /tea-options filters on is_active). The other 7 are kept as inactive
// rows — never deleted or renumbered — so historical recipes still read back by
// id. Order is preserved so a fresh deploy assigns the same ids as production
// (Ginger=2, Cinnamon=3, Lemongrass=9, Orange Peel=11 … Jasmine Petals=14).
//
// "Spices" is a misnomer — the last entries are peels and flowers. They live in
// this one list on purpose: GET /tea-options returns { baseTeas, spices } and
// the frontend destructures exactly those two keys. Bergamot is deliberately
// absent: it is a liquid flavouring dosed on a finished blend, not a proportion
// of it, so it cannot be expressed as { id, percentage }.
const SPICES = [
  { name: "Cardamom", is_active: false },
  { name: "Ginger", is_active: true },
  { name: "Cinnamon", is_active: true },
  { name: "Clove", is_active: false },
  { name: "Black Pepper", is_active: false },
  { name: "Nutmeg", is_active: false },
  { name: "Star Anise", is_active: false },
  { name: "Fennel", is_active: false },
  { name: "Lemongrass", is_active: true },
  { name: "Peppermint", is_active: false },
  { name: "Orange Peel", is_active: true },
  { name: "Lemon Peel", is_active: true },
  { name: "Rose Petals", is_active: true },
  { name: "Jasmine Petals", is_active: true },
];

// Insert any missing names, then reconcile is_active on every listed row so
// re-running brings the DB to the declared state without deleting/renumbering.
async function seedTable(model, label, items) {
  const existing = await model.findMany({ select: { name: true } });
  const present = new Set(existing.map((row) => row.name));
  const missing = items.filter((i) => !present.has(i.name));

  if (missing.length > 0) {
    await model.createMany({
      data: missing.map((i) => ({ name: i.name, is_active: i.is_active })),
    });
  }

  let reconciled = 0;
  for (const i of items) {
    const res = await model.updateMany({
      where: { name: i.name },
      data: { is_active: i.is_active },
    });
    reconciled += res.count;
  }

  const activeCount = items.filter((i) => i.is_active).length;
  console.log(
    `${label}: ${present.size + missing.length} rows ` +
      `(inserted ${missing.length}, ${activeCount} active) — flags reconciled on ${reconciled}`
  );
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
