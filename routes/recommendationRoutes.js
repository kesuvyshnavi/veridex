// server/backend/routes/recommendationRoutes.js
const express = require('express');
const router = express.Router();
const { generateRecommendations } = require('../controllers/recommendationController');

// POST /api/recommendations
router.post('/', generateRecommendations);

module.exports = router;