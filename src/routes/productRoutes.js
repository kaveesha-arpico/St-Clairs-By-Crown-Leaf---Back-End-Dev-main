const express = require('express');
const router = express.Router();
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct
} = require('../controllers/productController');

router.post('/product', createProduct);
router.get('/product', getAllProducts);
router.get('/product/:id', getProductById);
router.put('/product/:id', updateProduct);
router.delete('/product/:id', deleteProduct);

module.exports = router;