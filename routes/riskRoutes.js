// server/backend/routes/riskRoutes.js
const express = require('express');
const router = express.Router();
const { generateRiskAnalysis } = require('../controllers/riskController');

// POST /api/risk-analysis
router.post('/', generateRiskAnalysis);

module.exports = router;