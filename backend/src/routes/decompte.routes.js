const express = require('express');
const router = express.Router();
const {
  getAllDecomptes, getDecompteById, createDecompte,
  validateDecompte, rejectDecompte, requestRevision
} = require('../controllers/decompte.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

router.get('/', protect, getAllDecomptes);
router.get('/:id', protect, getDecompteById);

// Soumission par le fournisseur uniquement
router.post('/', protect, requireRole('fournisseur'), createDecompte);

// Actions de validation par le service transport uniquement
router.put('/:id/validate', protect, requireRole('transport'), validateDecompte);
router.put('/:id/reject', protect, requireRole('transport'), rejectDecompte);
router.put('/:id/revision', protect, requireRole('transport'), requestRevision);

module.exports = router;
