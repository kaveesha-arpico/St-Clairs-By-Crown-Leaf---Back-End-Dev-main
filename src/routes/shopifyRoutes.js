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

const router = express.Router();

router.post("/checkout", checkout);
router.post("/create-shopify-product", createProduct);
router.get("/get-shopify-store-products", getProducts);
router.get("/get-shopify-products", getProductsFromShopify);
router.get("/get-order-list", getOrderDetails);
router.post("/payment-webhook", paymentWebhookHandler);
router.get("/cart-status/:cartId", getCartPaymentStatus);

module.exports = router;




