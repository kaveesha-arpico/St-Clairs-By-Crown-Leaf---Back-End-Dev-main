const express = require("express");
const { getStorefrontProducts } = require("../controllers/storefrontController");
const {
  createCart,
  getCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
} = require("../controllers/cartController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
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

module.exports = router;
