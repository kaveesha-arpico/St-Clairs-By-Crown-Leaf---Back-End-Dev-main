const express = require('express');
const router = express.Router();
const {
    createField,
    getAllFields,
    getFieldById,
    updateField,
    deleteField
} = require('../controllers/fieldController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { field } = require('../validators/schemas');

router.post('/field', validate(field.create), asyncHandler(createField));
router.get('/field', asyncHandler(getAllFields));
router.get('/field/:id', validate(field.idParam), asyncHandler(getFieldById));
router.put('/field/:id', validate([...field.idParam, ...field.update]), asyncHandler(updateField));
router.delete('/field/:id', validate(field.idParam), asyncHandler(deleteField));

module.exports = router;
