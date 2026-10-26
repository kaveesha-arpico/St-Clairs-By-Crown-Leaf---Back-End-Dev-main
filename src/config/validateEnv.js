// validateEnv.js


const REQUIRED = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SHOPIFY_STOREFRONT_TOKEN",
];


const OPTIONAL = [
  "PORT",
  "DB_PORT",
  "FRONTEND_URL",
  "SHOPIFY_WEBHOOK_SECRET",
  // Contact-form email (Microsoft Graph) is optional; submissions are stored
  // regardless of whether mail is configured.
  "GRAPH_TENANT_ID",
  "GRAPH_CLIENT_ID",
  "GRAPH_CLIENT_SECRET",
  "GRAPH_SENDER",
  "CONTACT_TO",
  // TeaMatrix machine API key(s); the machine API returns 503 until set.
  "MACHINE_API_KEYS",
  // Optional IP allowlist for the machine API (LAN deployment). Unset = any IP.
  "MACHINE_ALLOWED_IPS",
  // JOINT TEST ONLY: "true" lets test/UAT orders into /pending. Unset normally.
  "MACHINE_INCLUDE_TEST_ORDERS",
  // Hosts a bottle trace link may point at (Addendum 2). The traceability
  // endpoint rejects every link until this is set.
  "TRACE_URL_HOSTS",
  // Smallest grams of any one ingredient the machine dispenses accurately.
  // Supplied by the machine team; 0 / unset disables the check.
  "BLEND_MIN_INGREDIENT_G",
  // Shopify product id of "Custom Blend Tea". Order lines with this product id
  // become machine_orders rows for the TeaMatrix machine. Unset while the
  // custom-blend page is disabled: no line is treated as a blend.
  "CUSTOM_BLEND_PRODUCT_ID",
  // Public traceability site, e.g. https://tea-details.crownandleaf.uk — this
  // is what the QR encodes. Trace codes are still generated without it; only
  // the QR endpoint is disabled (503) until it is set.
  "TRACE_BASE_URL",
];

function validateEnv() {
  const missing = REQUIRED.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    console.error(
      "\n[Config Error] Missing required environment variables:\n" +
        missing.map((k) => `  - ${k}`).join("\n") +
        "\n\nCopy .env.example to .env and fill in the values.\n"
    );
    process.exit(1);
  }

  const missingOptional = OPTIONAL.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn(
      "[Config] Using defaults for optional vars: " + missingOptional.join(", ")
    );
  }
}

module.exports = validateEnv;
