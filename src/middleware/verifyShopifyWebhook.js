// verifyShopifyWebhook.js
// Verifies the X-Shopify-Hmac-Sha256 signature on incoming Shopify webhooks
// using a timing-safe comparison. Requires req.rawBody (captured by the
// express.json verify hook in app.js).
//
// Two separate secrets are configured, and they are deliberately NOT
// interchangeable:
//
//   SHOPIFY_WEBHOOK_SECRET          the custom app's API secret key. Signs the
//                                   app-owned subscriptions that write orders,
//                                   payment state and the machine rows. Full
//                                   trust.
//   SHOPIFY_CONTACT_WEBHOOK_SECRET  the store's shared Notifications secret
//                                   (the one exposed in a screenshot in 2025-09
//                                   and not regenerable). Signs ONLY the
//                                   order-contact route, which may do nothing
//                                   but fill in a missing email / name.
//
// Keeping them in different variables means the exposed secret can never
// verify a delivery on the order-writing routes, whatever ends up in .env.
//
// Either variable may hold MORE THAN ONE secret, comma-separated, so a secret
// can be rotated with zero downtime: set "new,old", re-point the webhooks,
// watch deliveries succeed, then drop the old value. Every configured secret
// is tried on every request and the results are OR-ed, so timing does not
// reveal which one matched or how many there are.

const crypto = require("crypto");

function configuredSecrets(envVar) {
  return (process.env[envVar] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function signatureMatches(rawBody, hmacHeader, secret) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader);
  return digestBuf.length === headerBuf.length && crypto.timingSafeEqual(digestBuf, headerBuf);
}

/**
 * Build an HMAC-verifying middleware bound to ONE environment variable.
 * @param {string} envVar  name of the variable holding the secret(s)
 */
function makeVerifyShopifyWebhook(envVar) {
  return function verify(req, res, next) {
    const secrets = configuredSecrets(envVar);

    // Fail closed: an unverified webhook is exactly the hole we're closing.
    if (secrets.length === 0) {
      console.error(
        `[Shopify] ${envVar} is not set — rejecting webhook. ` +
          "Set it in .env to enable this webhook route."
      );
      return res.status(500).send("Webhook not configured.");
    }

    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
    if (!hmacHeader || !req.rawBody) {
      return res.status(401).send("Missing HMAC signature.");
    }

    const ok = secrets.reduce(
      (acc, secret) => signatureMatches(req.rawBody, hmacHeader, secret) || acc,
      false
    );
    if (!ok) {
      return res.status(401).send("HMAC validation failed.");
    }

    next();
  };
}

// The order-writing routes: app secret only.
const verifyShopifyWebhook = makeVerifyShopifyWebhook("SHOPIFY_WEBHOOK_SECRET");
// The contact-only route: store secret only.
const verifyShopifyContactWebhook = makeVerifyShopifyWebhook("SHOPIFY_CONTACT_WEBHOOK_SECRET");

module.exports = verifyShopifyWebhook;
module.exports.verifyShopifyWebhook = verifyShopifyWebhook;
module.exports.verifyShopifyContactWebhook = verifyShopifyContactWebhook;
module.exports.makeVerifyShopifyWebhook = makeVerifyShopifyWebhook;
