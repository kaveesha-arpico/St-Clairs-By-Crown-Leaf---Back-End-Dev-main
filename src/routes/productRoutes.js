const express = require('express');
const router = express.Router();
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct
} = require('../controllers/productController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { product } = require('../validators/schemas');

router.post('/product', validate(product.create), asyncHandler(createProduct));
router.get('/product', asyncHandler(getAllProducts));
router.get('/product/:id', validate(product.idParam), asyncHandler(getProductById));
router.put('/product/:id', validate([...product.idParam, ...product.update]), asyncHandler(updateProduct));
router.delete('/product/:id', validate(product.idParam), asyncHandler(deleteProduct));

module.exports = router;
