const express = require('express');
const router = express.Router();
const {
  getAllMaintenances, getMaintenanceById, createMaintenance,
  updateMaintenance, addMaintenanceItem, deleteMaintenanceItem
} = require('../controllers/maintenance.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

router.get('/', protect, getAllMaintenances);
router.get('/:id', protect, getMaintenanceById);
router.post('/', protect, requireRole('transport'), createMaintenance);
router.put('/:id', protect, requireRole('transport'), updateMaintenance);
router.post('/:id/items', protect, requireRole('transport'), addMaintenanceItem);
router.delete('/:id/items/:itemId', protect, requireRole('transport'), deleteMaintenanceItem);

module.exports = router;
