const express = require("express");
const { getStorefrontProducts } = require("../controllers/storefrontController");
const {
  createCart,
  getCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
  updateCartBuyerIdentity,
} = require("../controllers/cartController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { protect } = require("../middleware/authMiddleware");
const { storefrontCart } = require("../validators/schemas");

const router = express.Router();

// Public storefront catalog (read-only, Storefront GraphQL API).
router.get("/storefront/products", asyncHandler(getStorefrontProducts));

// Public storefront cart. The cart GID contains a `?key=...` component, so it
// is passed as a query parameter (GET) or body field (mutations) — never as a
// URL path segment.
router.post(
  "/storefront/cart",
  validate(storefrontCart.create),
  asyncHandler(createCart)
);
router.get(
  "/storefront/cart",
  validate(storefrontCart.get),
  asyncHandler(getCart)
);
router.post(
  "/storefront/cart/lines",
  validate(storefrontCart.addLines),
  asyncHandler(addCartLines)
);
router.patch(
  "/storefront/cart/lines",
  validate(storefrontCart.updateLines),
  asyncHandler(updateCartLines)
);
router.delete(
  "/storefront/cart/lines",
  validate(storefrontCart.removeLines),
  asyncHandler(removeCartLines)
);

// The one shop-flow route that requires auth: attach the signed-in customer's
// identity to their cart (identity is read from the JWT, not the body).
router.post(
  "/storefront/cart/buyer-identity",
  protect,
  validate(storefrontCart.buyerIdentity),
  asyncHandler(updateCartBuyerIdentity)
);

module.exports = router;
