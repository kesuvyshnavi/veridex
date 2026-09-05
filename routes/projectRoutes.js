// server/backend/routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const {
  createProject,
  listProjects,
  getProject,
  deleteProject,
  downloadProjectPdf,
  retryMarketAnalysis,
} = require('../controllers/projectController');
const { requireAuth } = require('../middleware/authMiddleware');
const { projectCreationLimiter } = require('../middleware/rateLimiter');

router.post('/', requireAuth, projectCreationLimiter, createProject);
router.get('/', requireAuth, listProjects);
router.get('/:id', requireAuth, getProject);
router.get('/:id/pdf', requireAuth, downloadProjectPdf);
router.post('/:id/retry-market-analysis', requireAuth, retryMarketAnalysis);
router.delete('/:id', requireAuth, deleteProject);

module.exports = router;