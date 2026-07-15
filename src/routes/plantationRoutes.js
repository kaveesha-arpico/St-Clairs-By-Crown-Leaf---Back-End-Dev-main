const express = require('express');
const router = express.Router();
const {
    createPlantation,
    getAllPlantations,
    getPlantationById,
    updatePlantation,
    deletePlantation
} = require('../controllers/plantationController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { plantation } = require('../validators/schemas');

router.post('/plantation', validate(plantation.create), asyncHandler(createPlantation));
router.get('/plantation', asyncHandler(getAllPlantations));
router.get('/plantation/:id', validate(plantation.idParam), asyncHandler(getPlantationById));
router.put('/plantation/:id', validate([...plantation.idParam, ...plantation.update]), asyncHandler(updatePlantation));
router.delete('/plantation/:id', validate(plantation.idParam), asyncHandler(deletePlantation));

module.exports = router;
