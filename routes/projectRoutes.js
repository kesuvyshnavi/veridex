// server/backend/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const { createProject, listProjects, getProject, deleteProject, downloadProjectPdf } = require('../controllers/projectController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, createProject);
router.get('/', requireAuth, listProjects);
router.get('/:id', requireAuth, getProject);
router.get('/:id/pdf', requireAuth, downloadProjectPdf);
router.delete('/:id', requireAuth, deleteProject);

module.exports = router;