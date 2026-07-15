// verifyShopifyWebhook.js
// Verifies the X-Shopify-Hmac-Sha256 signature on incoming Shopify webhooks
// using a timing-safe comparison. Requires req.rawBody (captured by the
// express.json verify hook in app.js) and SHOPIFY_WEBHOOK_SECRET.

const crypto = require("crypto");

function verifyShopifyWebhook(req, res, next) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  // Fail closed: an unverified webhook is exactly the hole we're closing.
  if (!secret) {
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

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader);

  if (
    digestBuf.length !== headerBuf.length ||
    !crypto.timingSafeEqual(digestBuf, headerBuf)
  ) {
    return res.status(401).send("HMAC validation failed.");
  }

  next();
}

module.exports = verifyShopifyWebhook;
