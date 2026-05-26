
const express = require('express');
const router = express.Router();
const {
    createBatch,
    getAllBatches,
    getBatchById,
    updateBatch,
    deleteBatch
} = require('../controllers/batchController');

router.post('/batch', createBatch);
router.get('/batch', getAllBatches);
router.get('/batch/:id', getBatchById);
router.put('/batch/:id', updateBatch);
router.delete('/batch/:id', deleteBatch);

module.exports = router;