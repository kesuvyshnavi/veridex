// server/backend/routes/recommendationRoutes.js
const express = require('express');
const router = express.Router();
const { generateRecommendations } = require('../controllers/recommendationController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /api/recommendations — requires login so the report can be
// persisted against the correct, owned project row.
router.post('/', requireAuth, generateRecommendations);

module.exports = router;