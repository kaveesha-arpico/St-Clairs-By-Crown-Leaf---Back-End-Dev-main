const express = require("express");
const {
  createTeaProduct,
  getAllTeaProducts,
  getAllTeaShopifyProducts,
  getAllTeaShopifyProductsVariants
} = require("../controllers/teaProductController");
const router = express.Router();

router.post("/tea-product-create", createTeaProduct);
router.get("/get-tea-products", getAllTeaProducts);
router.get("/get-tea-shopify-products", getAllTeaShopifyProducts);
router.get("/get-tea-shopify-products-variants", getAllTeaShopifyProductsVariants);

module.exports = router;
