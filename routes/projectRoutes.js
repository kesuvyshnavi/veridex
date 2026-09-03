// server/backend/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const { createProject } = require('../controllers/projectController');
const { requireAuth } = require('../middleware/authMiddleware');

// POST /api/projects — requires login so every project has an owner
router.post('/', requireAuth, createProject);

module.exports = router;