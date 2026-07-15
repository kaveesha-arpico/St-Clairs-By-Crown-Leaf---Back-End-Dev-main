// validateEnv.js


const REQUIRED = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_PASSWORD",
  "SHOPIFY_STOREFRONT_TOKEN",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
];


const OPTIONAL = ["PORT", "DB_PORT", "FRONTEND_URL", "SHOPIFY_WEBHOOK_SECRET"];

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
