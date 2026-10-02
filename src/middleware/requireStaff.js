// requireStaff.js
// Gates the admin API. Runs AFTER `protect`, which has already verified the JWT
// signature and put its payload on req.user.
//
// The check that matters is `typ === "staff"`. Customer tokens are signed with
// the same JWT_SECRET, so a valid customer token reaches this point looking
// entirely legitimate — only the claim distinguishes them. Customer tokens
// predate this field and carry no `typ` at all, so the absence of the claim
// must be treated as "not staff" rather than "unknown, allow": fail closed.

function requireStaff(req, res, next) {
  const user = req.user;

  if (!user || user.typ !== "staff") {
    // Deliberately the same message whichever way it failed — a customer
    // probing the admin API learns nothing about what it expected.
    return res
      .status(403)
      .json({ success: false, message: "Staff access required." });
  }

  return next();
}

/**
 * Stricter variant for the few endpoints that expose customer PII.
 * Used by the admin order list, which can show customer names.
 */
function requireAdmin(req, res, next) {
  const user = req.user;

  if (!user || user.typ !== "staff" || user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }

  return next();
}

module.exports = { requireStaff, requireAdmin };
