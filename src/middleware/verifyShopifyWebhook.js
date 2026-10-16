// verifyShopifyWebhook.js
// Verifies the X-Shopify-Hmac-Sha256 signature on incoming Shopify webhooks
// using a timing-safe comparison. Requires req.rawBody (captured by the
// express.json verify hook in app.js) and SHOPIFY_WEBHOOK_SECRET.
//
// SHOPIFY_WEBHOOK_SECRET may hold MORE THAN ONE secret, comma-separated, so the
// secret can be rotated with zero downtime: set "new,old", re-point the
// webhooks in Shopify (a custom app's secret, which can be regenerated), watch
// deliveries succeed, then drop the old value. Every configured secret is
// tried on every request and the results are OR-ed, so timing does not reveal
// which one matched or how many there are.

const crypto = require("crypto");

function configuredSecrets() {
  return (process.env.SHOPIFY_WEBHOOK_SECRET || "")
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

function verifyShopifyWebhook(req, res, next) {
  const secrets = configuredSecrets();

  // Fail closed: an unverified webhook is exactly the hole we're closing.
  if (secrets.length === 0) {
    console.error(
      "[Shopify] SHOPIFY_WEBHOOK_SECRET is not set — rejecting webhook. " +
        "Set it in .env to enable webhook processing."
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
}

module.exports = verifyShopifyWebhook;
