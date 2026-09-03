// server/backend/routes/riskRoutes.js
const express = require('express');
const router = express.Router();
const { generateRiskAnalysis } = require('../controllers/riskController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /api/risk-analysis — requires login so the result can be persisted
// against the correct, owned project row.
router.post('/', requireAuth, generateRiskAnalysis);

module.exports = router;