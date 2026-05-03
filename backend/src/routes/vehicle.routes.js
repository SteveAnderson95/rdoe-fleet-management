const express = require('express');
const router = express.Router();
const {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleStats
} = require('../controllers/vehicle.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

router.get('/stats', protect, getVehicleStats);

router.get('/', protect, getAllVehicles);
router.get('/:id', protect, getVehicleById);

router.post('/', protect, requireRole('transport'), createVehicle);
router.put('/:id', protect, requireRole('transport'), updateVehicle);
router.delete('/:id', protect, requireRole('transport'), deleteVehicle);

module.exports = router;
