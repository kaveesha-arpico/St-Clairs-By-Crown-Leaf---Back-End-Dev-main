const express = require('express');
const router = express.Router();

const {
    createCustomer,
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
} = require('../controllers/customerController');

router.post('/customers',createCustomer);
router.get('/customers',getAllCustomers);
router.get('/customers/:id',getCustomerById);
router.put('/customers/:id',updateCustomer);
router.delete('/customers/:id',deleteCustomer);

module.exports = router;