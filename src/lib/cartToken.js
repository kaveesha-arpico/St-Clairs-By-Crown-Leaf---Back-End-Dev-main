// cartToken.js
// Reduce any cart identifier to a canonical bare token.
//
// The storefront cart id is a GID: `gid://shopify/Cart/<TOKEN>?key=<KEY>`.
// The order webhook links back via `cart_token`. To make the value the webhook
// STORES and the value the storefront POLLS with always match — regardless of
// whether either side has a full GID, a URL-encoded GID, or a bare token — both
// sides normalize through this to the bare `<TOKEN>`.
function normalizeCartToken(input) {
  if (input === undefined || input === null) return input;
  let s = String(input);
  try {
    s = decodeURIComponent(s); // harmless if not encoded
  } catch {
    /* leave as-is on malformed encoding */
  }
  // gid://shopify/Cart/<TOKEN>?key=...  ->  <TOKEN>
  const afterCart = s.includes("/Cart/") ? s.split("/Cart/")[1] : s;
  return afterCart.split("?")[0].trim();
}

module.exports = { normalizeCartToken };
