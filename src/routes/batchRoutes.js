const express = require('express');
const router = express.Router();
const {
    createBatch,
    getAllBatches,
    getBatchById,
    updateBatch,
    deleteBatch
} = require('../controllers/batchController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { batch } = require('../validators/schemas');

router.post('/batch', validate(batch.create), asyncHandler(createBatch));
router.get('/batch', asyncHandler(getAllBatches));
router.get('/batch/:id', validate(batch.idParam), asyncHandler(getBatchById));
router.put('/batch/:id', validate([...batch.idParam, ...batch.update]), asyncHandler(updateBatch));
router.delete('/batch/:id', validate(batch.idParam), asyncHandler(deleteBatch));

module.exports = router;
