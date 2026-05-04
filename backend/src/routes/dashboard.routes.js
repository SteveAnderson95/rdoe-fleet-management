const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboard.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

router.get('/stats', protect, requireRole('transport', 'consultant'), getDashboardStats);

module.exports = router;
