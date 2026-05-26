const express = require('express');
const router = express.Router();
const {
    createFactory,
    getAllFactories,
    getFactoryById,
    updateFactory,
    deleteFactory
} = require('../controllers/factoryController');

router.post('/factory', createFactory);
router.get('/factory', getAllFactories);
router.get('/factory/:id', getFactoryById);
router.put('/factory/:id', updateFactory);
router.delete('/factory/:id', deleteFactory);

module.exports = router;