// shopifyAdmin.js
// Thin wrapper around the Shopify Admin GraphQL API.
//
// This is the privileged, server-only path for merchant operations: reading
// orders, creating/updating products, inventory, etc. It authenticates with the
// custom app's Admin API access token via the `X-Shopify-Access-Token` header —
// this token must NEVER be exposed to the browser. Shopify's REST Admin API is
// legacy; new work should use this GraphQL client. API version is env-driven.

require("dotenv").config();

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

/**
 * Execute an Admin GraphQL query/mutation.
 * @param {string} query - GraphQL document.
 * @param {object} [variables] - GraphQL variables.
 * @returns {Promise<object>} the `data` object from the response.
 * @throws {Error} on missing config, network failure, HTTP error, or GraphQL errors.
 */
async function adminGraphQL(query, variables = {}) {
  if (!STORE_DOMAIN || !ADMIN_TOKEN) {
    throw new Error(
      "Shopify Admin is not configured — set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in .env."
    );
  }

  const endpoint = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Shopify Admin HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  const payload = await response.json();

  // GraphQL can return 200 with an `errors` array (bad query, missing scope).
  if (payload.errors && payload.errors.length > 0) {
    const messages = payload.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify Admin GraphQL error: ${messages}`);
  }

  return payload.data;
}

module.exports = { adminGraphQL, API_VERSION };
