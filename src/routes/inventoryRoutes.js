const express = require('express');
const router = express.Router();
const {
    createInventory,
    getAllInventories,
    getInventoryById,
    updateInventory,
    deleteInventory
} = require('../controllers/inventoryController');

router.post('/inventory', createInventory);
router.get('/inventory', getAllInventories);
router.get('/inventory/:id', getInventoryById);
router.put('/inventory/:id', updateInventory);
router.delete('/inventory/:id', deleteInventory);

module.exports = router;