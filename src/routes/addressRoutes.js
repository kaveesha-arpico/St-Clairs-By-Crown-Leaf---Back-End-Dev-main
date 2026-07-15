const express = require ('express');
const router = express.Router();
const{
    createAddress,
    getAllAddresses,
    getAddressesByCustomer,
    updateAddress,
    deleteAddress
} = require('../controllers/addressController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { address } = require('../validators/schemas');

router.post('/addresses', validate(address.create), asyncHandler(createAddress));
router.get('/addresses', asyncHandler(getAllAddresses));
router.get('/addresses/customer/:customerId', validate(address.customerIdParam), asyncHandler(getAddressesByCustomer));
router.put('/addresses/:id', validate([...address.idParam, ...address.update]), asyncHandler(updateAddress));
router.delete('/addresses/:id', validate(address.idParam), asyncHandler(deleteAddress));

module.exports = router;
