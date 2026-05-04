const express = require('express');
const router = express.Router();
const { getAllPieces, getPieceById, createPiece, updatePiece, getModeles } = require('../controllers/piece.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

// Avant /:id pour éviter un conflit de route
router.get('/modeles', protect, getModeles);

router.get('/', protect, getAllPieces);
router.get('/:id', protect, getPieceById);
router.post('/', protect, requireRole('transport'), createPiece);
router.put('/:id', protect, requireRole('transport'), updatePiece);

module.exports = router;
