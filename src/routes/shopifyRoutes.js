const express = require("express");
const {
  checkout,
  createProduct,
  getProducts,
  getProductsFromShopify,
  getOrderDetails,
  getCartPaymentStatus,
  paymentWebhookHandler,
} = require("../controllers/shopifyController");
const verifyShopifyWebhook = require("../middleware/verifyShopifyWebhook");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { shopify } = require("../validators/schemas");

const router = express.Router();

router.post("/checkout", validate(shopify.checkout), asyncHandler(checkout));
router.post("/create-shopify-product", createProduct);
router.get("/get-shopify-store-products", getProducts);
router.get("/get-shopify-products", getProductsFromShopify);
router.get("/get-order-list", getOrderDetails);
router.post("/payment-webhook", verifyShopifyWebhook, paymentWebhookHandler);
router.get("/cart-status/:cartId", getCartPaymentStatus);

module.exports = router;




