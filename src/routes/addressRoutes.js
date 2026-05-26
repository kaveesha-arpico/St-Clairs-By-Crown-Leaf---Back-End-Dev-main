const express = require ('express');
const router = express.Router();
const{
    createAddress,
    getAllAddresses,
    getAddressesByCustomer,
    updateAddress,
    deleteAddress
} = require('../controllers/addressController');

router.post('/addresses',createAddress);
router.get('/addresses', getAllAddresses);
router.get('/addresses/customer/:customerId', getAddressesByCustomer);
router.put('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);

module.exports = router;