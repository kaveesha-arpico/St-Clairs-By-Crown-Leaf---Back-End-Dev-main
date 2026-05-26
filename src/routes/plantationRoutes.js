// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
    createPlantation,
    getAllPlantations,
    getPlantationById,
    updatePlantation,
    deletePlantation
} = require('../controllers/plantationController');

router.post('/plantation', createPlantation);
router.get('/plantation', getAllPlantations);
router.get('/plantation/:id', getPlantationById);
router.put('/plantation/:id', updatePlantation);
router.delete('/plantation/:id', deletePlantation);

module.exports = router;