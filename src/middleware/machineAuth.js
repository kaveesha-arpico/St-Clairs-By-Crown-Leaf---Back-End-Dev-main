// machineAuth.js
// Bearer-token auth for the tea-dispensing machine feed. Separate from the JWT
// used by human/admin routes and from Shopify's webhook secret, so it can be
// revoked on its own. MACHINE_API_KEYS is a comma-separated list, so a key can
// be rotated without downtime (add the new one, cut over, drop the old one).

const crypto = require("crypto");

const KEYS = (process.env.MACHINE_API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

// Constant-time equality that also tolerates length differences (timingSafeEqual
// throws on unequal lengths).
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function machineAuth(req, res, next) {
  if (KEYS.length === 0) {
    console.error(
      "[machineAuth] MACHINE_API_KEYS not set — machine feed is disabled."
    );
    return res.status(503).json({ error: "Machine API not configured." });
  }

  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }

  // Compare against every key; OR the results so timing doesn't reveal which
  // key matched (or how many are configured).
  const ok = KEYS.reduce((acc, key) => safeEqual(token, key) || acc, false);
  if (!ok) return res.status(401).json({ error: "Invalid token." });

  return next();
}

module.exports = machineAuth;
