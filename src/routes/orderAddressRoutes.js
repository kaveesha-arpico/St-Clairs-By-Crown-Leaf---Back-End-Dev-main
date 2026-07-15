const express = require('express');
const router = express.Router();

const{
    addOrderAddress,
    getAddressesForOrder,
    removeOrderAddress
}=require('../controllers/orderAddressController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { orderAddress } = require('../validators/schemas');

router.post('/order-addresses', validate(orderAddress.create), asyncHandler(addOrderAddress));
router.get('/order-addresses/:orderId', validate(orderAddress.orderIdParam), asyncHandler(getAddressesForOrder));
router.delete('/order-addresses/:orderId/:addressId', validate(orderAddress.linkParams), asyncHandler(removeOrderAddress));

module.exports = router;
