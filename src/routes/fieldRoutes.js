
const express = require('express');
const router = express.Router();
const {
    createField,
    getAllFields,
    getFieldById,
    updateField,
    deleteField
} = require('../controllers/fieldController');

router.post('/field', createField);
router.get('/field', getAllFields);
router.get('/field/:id', getFieldById);
router.put('/field/:id', updateField);
router.delete('/field/:id', deleteField);

module.exports = router;