// server/backend/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const { createProject, listProjects, getProject, deleteProject } = require('../controllers/projectController');
const { requireAuth } = require('../middleware/authMiddleware');

// All project routes require login — every project has an owner, and
// every read/write is scoped to req.userId inside the controller.
router.post('/', requireAuth, createProject);
router.get('/', requireAuth, listProjects);
router.get('/:id', requireAuth, getProject);
router.delete('/:id', requireAuth, deleteProject);

module.exports = router;