const express = require('express');
const router = express.Router();
const {
    createLocation,
    getAllLocations,
    getLocationById,
    updateLocation,
    deleteLocation
} = require('../controllers/locationController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { location } = require('../validators/schemas');

router.post('/location', validate(location.create), asyncHandler(createLocation));
router.get('/location', asyncHandler(getAllLocations));
router.get('/location/:id', validate(location.idParam), asyncHandler(getLocationById));
router.put('/location/:id', validate([...location.idParam, ...location.update]), asyncHandler(updateLocation));
router.delete('/location/:id', validate(location.idParam), asyncHandler(deleteLocation));

module.exports = router;
