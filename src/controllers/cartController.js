// cartController.js
// Server-backed Shopify cart. Shopify owns the cart (and all money): the client
// keeps only the cart ID and every mutation round-trips to Shopify, so totals,
// availability and discounts always come back authoritative.
//
// Cart and line IDs are GIDs and must be passed back verbatim as strings. The
// cart GID contains a `?key=...` component, so it travels as a query parameter
// or body field — never as a URL path segment.

const {
  storefrontGraphQL,
  validateVariants,
} = require("../lib/shopifyStorefront");

// Shared shape returned by every cart operation.
const CART_FIELDS = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
      totalTaxAmount { amount currencyCode }
    }
    lines(first: 250) {
      edges {
        node {
          id
          quantity
          attributes { key value }
          cost {
            totalAmount { amount currencyCode }
            amountPerQuantity { amount currencyCode }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              sku
              availableForSale
              price { amount currencyCode }
              image { url altText }
              selectedOptions { name value }
              product { id title handle }
            }
          }
        }
      }
    }
  }
`;

const CART_QUERY = `
  ${CART_FIELDS}
  query Cart($id: ID!) {
    cart(id: $id) { ...CartFields }
  }
`;

const CART_CREATE = `
  ${CART_FIELDS}
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD = `
  ${CART_FIELDS}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE = `
  ${CART_FIELDS}
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const CART_LINES_REMOVE = `
  ${CART_FIELDS}
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const CART_BUYER_IDENTITY_UPDATE = `
  ${CART_FIELDS}
  mutation CartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

// Flatten Shopify's edges/node envelope into a frontend-friendly cart.
function shapeCart(cart) {
  if (!cart) return null;
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    cost: cart.cost,
    lines: cart.lines.edges.map(({ node }) => ({
      id: node.id, // CartLine GID — required to update/remove this line
      quantity: node.quantity,
      attributes: node.attributes,
      cost: node.cost,
      merchandise: node.merchandise,
    })),
  };
}

// Reject invalid/sold-out variants before they reach the cart. Returns true if
// the request was rejected (response already sent).
async function rejectBadVariants(variantIds, req, res) {
  const { invalid, unavailable } = await validateVariants(variantIds, {
    buyerIp: req.ip,
  });
  if (invalid.length > 0 || unavailable.length > 0) {
    res.status(400).json({
      success: false,
      message: "One or more items are invalid or unavailable.",
      invalid,
      unavailable,
    });
    return true;
  }
  return false;
}

// Shopify returns userErrors (e.g. unknown cart id) with HTTP 200.
function sendCartResult(res, result, notFoundMessage) {
  if (result.userErrors && result.userErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: notFoundMessage,
      errors: result.userErrors,
    });
  }
  return res.status(200).json({ success: true, cart: shapeCart(result.cart) });
}

// POST /api/storefront/cart — create a cart, optionally with initial items.
const createCart = async (req, res) => {
  const items = req.body.items || [];

  if (items.length > 0) {
    const rejected = await rejectBadVariants(
      items.map((i) => i.variantId),
      req,
      res
    );
    if (rejected) return;
  }

  const lines = items.map((item) => ({
    merchandiseId: item.variantId,
    quantity: item.quantity,
    ...(item.attributes ? { attributes: item.attributes } : {}),
  }));

  const data = await storefrontGraphQL(
    CART_CREATE,
    { input: { lines } },
    { buyerIp: req.ip }
  );

  return sendCartResult(res, data.cartCreate, "Failed to create cart.");
};

// GET /api/storefront/cart?id=<cart gid> — read a cart back (survives reloads).
const getCart = async (req, res) => {
  const cartId = req.query.id;

  const data = await storefrontGraphQL(
    CART_QUERY,
    { id: cartId },
    { buyerIp: req.ip }
  );

  // An unknown or expired cart resolves to null rather than an error.
  if (!data.cart) {
    return res
      .status(404)
      .json({ success: false, message: "Cart not found or expired." });
  }

  return res.status(200).json({ success: true, cart: shapeCart(data.cart) });
};

// POST /api/storefront/cart/lines — add items to an existing cart.
const addCartLines = async (req, res) => {
  const { cartId, items } = req.body;

  const rejected = await rejectBadVariants(
    items.map((i) => i.variantId),
    req,
    res
  );
  if (rejected) return;

  const lines = items.map((item) => ({
    merchandiseId: item.variantId,
    quantity: item.quantity,
    ...(item.attributes ? { attributes: item.attributes } : {}),
  }));

  const data = await storefrontGraphQL(
    CART_LINES_ADD,
    { cartId, lines },
    { buyerIp: req.ip }
  );

  return sendCartResult(res, data.cartLinesAdd, "Failed to add items to cart.");
};

// PATCH /api/storefront/cart/lines — change quantities. Uses CartLine ids
// (from cart.lines[].id), not variant ids.
const updateCartLines = async (req, res) => {
  const { cartId, lines } = req.body;

  const data = await storefrontGraphQL(
    CART_LINES_UPDATE,
    {
      cartId,
      lines: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
    },
    { buyerIp: req.ip }
  );

  return sendCartResult(res, data.cartLinesUpdate, "Failed to update cart.");
};

// DELETE /api/storefront/cart/lines — remove lines by CartLine id.
const removeCartLines = async (req, res) => {
  const { cartId, lineIds } = req.body;

  const data = await storefrontGraphQL(
    CART_LINES_REMOVE,
    { cartId, lineIds },
    { buyerIp: req.ip }
  );

  return sendCartResult(
    res,
    data.cartLinesRemove,
    "Failed to remove items from cart."
  );
};

// POST /api/storefront/cart/buyer-identity — attach the signed-in customer's
// identity to their Shopify cart so the hosted checkout opens prefilled.
// The email is taken from the authenticated token, NEVER the request body, so a
// client can't set an arbitrary identity. Email-only for now (the highest-value
// field); address prefill can be added later via deliveryAddressPreferences.
const updateCartBuyerIdentity = async (req, res) => {
  const { cartId } = req.body;
  const email = req.user && req.user.email;

  if (!email) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  const data = await storefrontGraphQL(
    CART_BUYER_IDENTITY_UPDATE,
    { cartId, buyerIdentity: { email } },
    { buyerIp: req.ip }
  );

  const result = data.cartBuyerIdentityUpdate;
  const errors = result.userErrors || [];

  // Shopify quirk: for an unknown cart it still returns a (bogus) cart object
  // AND a userError on the `cartId` field — so we can't rely on a null cart.
  // A cartId error => the cart is unknown/expired (404, matching GET /cart);
  // any other userError is a validation problem (400).
  if (errors.length > 0) {
    const cartError = errors.some(
      (e) => Array.isArray(e.field) && e.field.includes("cartId")
    );
    return res.status(cartError ? 404 : 400).json({
      success: false,
      message: cartError
        ? "Cart not found or expired."
        : "Failed to update buyer identity.",
      errors,
    });
  }

  if (!result.cart) {
    return res
      .status(404)
      .json({ success: false, message: "Cart not found or expired." });
  }

  return res.status(200).json({ success: true, cart: shapeCart(result.cart) });
};

module.exports = {
  createCart,
  getCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
  updateCartBuyerIdentity,
};
