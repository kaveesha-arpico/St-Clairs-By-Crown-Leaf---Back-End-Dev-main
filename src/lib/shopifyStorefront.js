// shopifyStorefront.js
// Thin wrapper around the Shopify Storefront GraphQL API.
//
// This is the modern, buyer-facing read path (products, collections, carts,
// checkout URL). Because these requests run server-side, we authenticate with
// the Headless channel's PRIVATE Storefront token, which Shopify recommends for
// server code — it uses the `Shopify-Storefront-Private-Token` header (NOT the
// `X-Shopify-Storefront-Access-Token` header, which is for the PUBLIC token used
// from browsers). The API version is env-driven so it can be bumped without edits.

require("dotenv").config();

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

/**
 * Execute a Storefront GraphQL query/mutation.
 * @param {string} query - GraphQL document.
 * @param {object} [variables] - GraphQL variables.
 * @param {object} [opts]
 * @param {string} [opts.buyerIp] - buyer's IP, forwarded per Shopify guidance
 *   when a server-side request represents real buyer traffic.
 * @returns {Promise<object>} the `data` object from the response.
 * @throws {Error} on missing config, network failure, HTTP error, or GraphQL errors.
 */
async function storefrontGraphQL(query, variables = {}, opts = {}) {
  if (!STORE_DOMAIN || !STOREFRONT_TOKEN) {
    throw new Error(
      "Shopify Storefront is not configured — set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN in .env."
    );
  }

  const endpoint = `https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`;

  const headers = {
    "Content-Type": "application/json",
    // Private token (Headless channel), for server-side use.
    "Shopify-Storefront-Private-Token": STOREFRONT_TOKEN,
  };
  if (opts.buyerIp) {
    headers["Shopify-Storefront-Buyer-IP"] = opts.buyerIp;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Shopify Storefront HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  const payload = await response.json();

  // GraphQL can return 200 with an `errors` array (bad query, bad token scope).
  if (payload.errors && payload.errors.length > 0) {
    const messages = payload.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify Storefront GraphQL error: ${messages}`);
  }

  return payload.data;
}

// Confirm each variant GID exists and is purchasable. `nodes` returns entries in
// the requested order with null for ids that don't resolve; the ProductVariant
// fragment only populates for real variants.
const VALIDATE_VARIANTS_QUERY = `
  query ValidateVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        availableForSale
      }
    }
  }
`;

/**
 * Check variant GIDs against Shopify before letting them into a cart.
 * The frontend must not be the only thing deciding what's purchasable.
 * @param {string[]} ids - variant GIDs (duplicates are fine).
 * @param {object} [opts] - forwarded to storefrontGraphQL (e.g. { buyerIp }).
 * @returns {Promise<{invalid: string[], unavailable: string[]}>}
 */
async function validateVariants(ids, opts = {}) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { invalid: [], unavailable: [] };

  const data = await storefrontGraphQL(
    VALIDATE_VARIANTS_QUERY,
    { ids: uniqueIds },
    opts
  );

  const availability = new Map();
  for (const node of data.nodes || []) {
    if (node && node.id) availability.set(node.id, node.availableForSale);
  }

  return {
    invalid: uniqueIds.filter((id) => !availability.has(id)),
    unavailable: uniqueIds.filter((id) => availability.get(id) === false),
  };
}

module.exports = { storefrontGraphQL, validateVariants, API_VERSION };
