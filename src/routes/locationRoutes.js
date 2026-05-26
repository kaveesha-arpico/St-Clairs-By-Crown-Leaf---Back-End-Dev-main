const express = require('express');
const router = express.Router();
const {
    createLocation,
    getAllLocations,
    getLocationById,
    updateLocation,
    deleteLocation
} = require('../controllers/locationController');

router.post('/location', createLocation);
router.get('/location', getAllLocations);
router.get('/location/:id', getLocationById);
router.put('/location/:id', updateLocation);
router.delete('/location/:id', deleteLocation);

module.exports = router;