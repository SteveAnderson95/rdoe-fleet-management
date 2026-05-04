const express = require('express');
const router = express.Router();
const { getMyStock, addStockItem, updateStockItem, deleteStockItem, getStockAlerts } = require('../controllers/stock.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

// Fournisseur gère son propre stock
router.get('/alerts', protect, requireRole('fournisseur'), getStockAlerts);
router.get('/', protect, requireRole('fournisseur'), getMyStock);
router.post('/', protect, requireRole('fournisseur'), addStockItem);
router.put('/:id', protect, requireRole('fournisseur'), updateStockItem);
router.delete('/:id', protect, requireRole('fournisseur'), deleteStockItem);

module.exports = router;
