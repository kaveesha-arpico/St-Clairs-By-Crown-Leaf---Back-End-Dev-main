// exportProductIds.js
// One-off/on-demand export of the product -> variant id mapping the TeaMatrix
// machine needs to match a feed line to a physical product. It reads straight
// from Shopify (the authoritative source) rather than the orders table, so it
// covers every product regardless of whether it has been ordered yet.
//
// Run on the VM inside the backend container (has the Admin token in env):
//   docker compose exec -T backend node scripts/exportProductIds.js
// Prints CSV to stdout (copy/paste to TeaMatrix) and a summary to stderr.

const { adminGraphQL } = require("../src/lib/shopifyAdmin");

// Shopify GraphQL ids are GIDs ("gid://shopify/ProductVariant/123"); the webhook
// line-item product_id/variant_id are the bare numbers. Match that form.
const numericId = (gid) => (gid ? String(gid).split("/").pop() : null);

// Minimal CSV quoting: wrap in quotes and double any inner quotes if the value
// contains a comma, quote, or newline.
function csv(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const QUERY = `
  query ProductIds($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          variants(first: 100) {
            edges { node { id title sku } }
          }
        }
      }
    }
  }
`;

async function main() {
  const rows = [];
  let cursor = null;
  let productCount = 0;

  // Paginate products in case the catalogue grows past one page.
  do {
    const data = await adminGraphQL(QUERY, { cursor });
    const conn = data.products;
    for (const { node: product } of conn.edges) {
      productCount++;
      for (const { node: variant } of product.variants.edges) {
        rows.push({
          product_id: numericId(product.id),
          variant_id: numericId(variant.id),
          title: product.title,
          variant_title: variant.title,
          sku: variant.sku || "",
          status: product.status, // ACTIVE / ARCHIVED / DRAFT
        });
      }
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  rows.sort(
    (a, b) =>
      a.title.localeCompare(b.title) ||
      String(a.variant_title).localeCompare(String(b.variant_title))
  );

  console.log("product_id,variant_id,title,variant_title,sku,status");
  for (const r of rows) {
    console.log(
      [
        r.product_id,
        r.variant_id,
        csv(r.title),
        csv(r.variant_title),
        csv(r.sku),
        r.status,
      ].join(",")
    );
  }

  const missingSku = rows.filter((r) => !r.sku).length;
  console.error(
    `\n${rows.length} variants across ${productCount} products.` +
      (missingSku
        ? ` WARNING: ${missingSku} variant(s) have no SKU — those can't be matched by SKU if their product_id ever goes null.`
        : " Every variant has a SKU.")
  );
}

main().catch((err) => {
  console.error("Export failed:", err.message);
  process.exit(1);
});
