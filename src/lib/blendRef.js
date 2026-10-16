// blendRef.js
// The human-readable, traceable reference for a custom blend:
// BLEND-<year>-<6-digit id>. Derived from the numeric custom_blends.id (the
// source of truth), so no extra column is needed and a reference always
// reverses back to exactly one recipe.
//
// Shared by the blend API (which hands the ref to the storefront as the
// "Blend ID" cart-line attribute) and the order webhook (which reads it back
// off each order line to find the recipe for the machine).

function blendRef(id, createdAt) {
  const year = (createdAt ? new Date(createdAt) : new Date()).getFullYear();
  return `BLEND-${year}-${String(id).padStart(6, "0")}`;
}

// Accepts "BLEND-2026-000042", "000042", or "42" and returns the numeric id.
function parseBlendId(ref) {
  if (ref === null || ref === undefined) return NaN;
  const match = String(ref).match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : NaN;
}

module.exports = { blendRef, parseBlendId };
