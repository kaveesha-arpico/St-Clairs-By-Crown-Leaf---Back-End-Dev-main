// machineAuth.js
// Bearer-token auth for the TeaMatrix machine API (spec v1.1 §6). Separate from
// the JWT used by human/admin routes and from Shopify's webhook secret, so it
// can be revoked on its own. MACHINE_API_KEYS is a comma-separated list, so a
// key can be rotated without downtime (add the new one, cut over, drop the old).
//
// Optional IP allowlist (§6.2): MACHINE_ALLOWED_IPS, comma-separated. When set,
// a request from any other address is refused with the same 401 as a bad key,
// so a probe learns nothing. Unset = no address restriction (the public URL).

const crypto = require("crypto");

const KEYS = (process.env.MACHINE_API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const ALLOWED_IPS = (process.env.MACHINE_ALLOWED_IPS || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

// Constant-time equality that also tolerates length differences (timingSafeEqual
// throws on unequal lengths).
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Node reports an IPv4 caller on a dual-stack socket as "::ffff:10.0.100.112".
function normalizeIp(ip) {
  const s = String(ip || "");
  return s.startsWith("::ffff:") ? s.slice("::ffff:".length) : s;
}

function unauthorized(res) {
  // One message whichever check failed: a probe must not learn which part was wrong.
  return res.status(401).json({ schema_version: 1, error_code: "UNAUTHORIZED", error: "Unauthorized." });
}

function machineAuth(req, res, next) {
  if (KEYS.length === 0) {
    console.error(
      "[machineAuth] MACHINE_API_KEYS not set — machine API is disabled."
    );
    return res
      .status(503)
      .json({ schema_version: 1, error_code: "NOT_CONFIGURED", error: "Machine API not configured." });
  }

  if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.includes(normalizeIp(req.ip))) {
    return unauthorized(res);
  }

  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) return unauthorized(res);

  // Compare against every key; OR the results so timing doesn't reveal which
  // key matched (or how many are configured).
  const ok = KEYS.reduce((acc, key) => safeEqual(token, key) || acc, false);
  if (!ok) return unauthorized(res);

  return next();
}

module.exports = machineAuth;
module.exports.normalizeIp = normalizeIp;
