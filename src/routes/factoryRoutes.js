const express = require('express');
const router = express.Router();
const {
    createFactory,
    getAllFactories,
    getFactoryById,
    updateFactory,
    deleteFactory
} = require('../controllers/factoryController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { factory } = require('../validators/schemas');

router.post('/factory', validate(factory.create), asyncHandler(createFactory));
router.get('/factory', asyncHandler(getAllFactories));
router.get('/factory/:id', validate(factory.idParam), asyncHandler(getFactoryById));
router.put('/factory/:id', validate([...factory.idParam, ...factory.update]), asyncHandler(updateFactory));
router.delete('/factory/:id', validate(factory.idParam), asyncHandler(deleteFactory));

module.exports = router;
