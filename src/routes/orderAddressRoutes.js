const express = require('express');
const router = express.Router();

const{
    addOrderAddress,
    getAddressesForOrder,
    removeOrderAddress
}=require('../controllers/orderAddressController');

router.post('/order-addresses', addOrderAddress);
router.get('/order-addresses/:orderId', getAddressesForOrder);
router.delete('/order-addresses/:orderId/:addressId', removeOrderAddress);

module.exports = router;