const express = require('express');
const router = express.Router();
const {
    createInventory,
    getAllInventories,
    getInventoryById,
    updateInventory,
    deleteInventory
} = require('../controllers/inventoryController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { inventory } = require('../validators/schemas');

router.post('/inventory', validate(inventory.create), asyncHandler(createInventory));
router.get('/inventory', asyncHandler(getAllInventories));
router.get('/inventory/:id', validate(inventory.idParam), asyncHandler(getInventoryById));
router.put('/inventory/:id', validate([...inventory.idParam, ...inventory.update]), asyncHandler(updateInventory));
router.delete('/inventory/:id', validate(inventory.idParam), asyncHandler(deleteInventory));

module.exports = router;
