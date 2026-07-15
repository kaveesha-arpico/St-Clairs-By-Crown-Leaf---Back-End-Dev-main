const express = require('express');
const router = express.Router();

const {
    createCustomer,
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
} = require('../controllers/customerController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { customer } = require('../validators/schemas');

router.post('/customers', validate(customer.create), asyncHandler(createCustomer));
router.get('/customers', asyncHandler(getAllCustomers));
router.get('/customers/:id', validate(customer.idParam), asyncHandler(getCustomerById));
router.put('/customers/:id', validate([...customer.idParam, ...customer.update]), asyncHandler(updateCustomer));
router.delete('/customers/:id', validate(customer.idParam), asyncHandler(deleteCustomer));

module.exports = router;
