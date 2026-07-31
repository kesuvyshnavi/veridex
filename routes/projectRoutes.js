// server/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const { createProject } = require('../controllers/projectController');

// POST /api/projects
router.post('/', createProject);

module.exports = router;