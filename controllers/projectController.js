// server/backend/controllers/projectController.js
// Handles validation, DB insertion, triggering AI analysis, and (M4)
// listing/viewing/deleting the logged-in user's own projects.

const pool = require('../db/database');
const { getMarketAnalysis } = require('../services/aiService');
const { generateProjectPdf } = require('../services/pdfService');

const ALLOWED_INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'E-commerce',
  'Education', 'Agriculture', 'Manufacturing', 'Other',
];
const ALLOWED_BUSINESS_MODELS = [
  'B2B', 'B2C', 'B2B2C', 'Marketplace', 'SaaS', 'D2C', 'Other',
];
const ALLOWED_TARGET_MARKETS = [
  'Local', 'National', 'International', 'Niche', 'Mass Market',
];
const ALLOWED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

function validateProjectInput(data) {
  const errors = [];
  const { project_name, industry, business_model, target_market, currency, budget, description } = data;

  if (!project_name || project_name.trim().length < 2) {
    errors.push('Project name must be at least 2 characters long.');
  }
  if (!industry || !ALLOWED_INDUSTRIES.includes(industry)) {
    errors.push('Please select a valid industry/sector.');
  }
  if (!business_model || !ALLOWED_BUSINESS_MODELS.includes(business_model)) {
    errors.push('Please select a valid business model.');
  }
  if (!target_market || !ALLOWED_TARGET_MARKETS.includes(target_market)) {
    errors.push('Please select a valid target market.');
  }
  if (!currency || !ALLOWED_CURRENCIES.includes(currency)) {
    errors.push('Please select a valid currency.');
  }
  if (!budget || budget.trim().length === 0) {
    errors.push('Budget is required.');
  }
  if (!description || description.trim().length < 20) {
    errors.push('Project description must be at least 20 characters long.');
  }

  return errors;
}

async function createProject(req, res) {
  try {
    const { project_name, industry, business_model, target_market, currency, budget, description } =
      req.body;

    const errors = validateProjectInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const insertQuery = `
      INSERT INTO projects (user_id, project_name, industry, business_model, target_market, currency, budget, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `;
    const values = [req.userId, project_name, industry, business_model, target_market, currency, budget, description];

    const dbResult = await pool.query(insertQuery, values);
    const projectId = dbResult.rows[0].id;

    let analysis;
    try {
      analysis = await getMarketAnalysis(req.body);
    } catch (aiError) {
      console.error('ai analysis failed:', aiError.message);
      return res.status(201).json({
        success: true,
        projectId,
        analysis: null,
        analysisError: 'Market analysis could not be generated. Please try again later.',
      });
    }

    pool
      .query('UPDATE projects SET market_analysis = $1 WHERE id = $2', [JSON.stringify(analysis), projectId])
      .catch((err) => console.error('Failed to persist market_analysis:', err.message));

    return res.status(201).json({
      success: true,
      projectId,
      analysis,
    });
  } catch (err) {
    console.error('Error in createProject:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while saving the project.',
    });
  }
}

// GET /api/projects — list only the logged-in user's own projects, newest
// first. Returns the persisted analyses too, so the dashboard can show
// quick-glance scores without re-calling any AI engine.
async function listProjects(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, project_name, industry, business_model, target_market, currency, budget,
              created_at, market_analysis, risk_analysis, recommendations
       FROM projects
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );

    return res.status(200).json({ success: true, projects: result.rows });
  } catch (err) {
    console.error('Error in listProjects:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while loading your projects.' });
  }
}

// GET /api/projects/:id — a single project, ownership-checked. Used by the
// consolidated report view.
async function getProject(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, project_name, industry, business_model, target_market, currency, budget,
              description, created_at, market_analysis, risk_analysis, recommendations
       FROM projects
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    return res.status(200).json({ success: true, project: result.rows[0] });
  } catch (err) {
    console.error('Error in getProject:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while loading this project.' });
  }
}

// DELETE /api/projects/:id — ownership-checked; only deletes if the row
// actually belongs to the logged-in user.
async function deleteProject(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id', [
      id,
      req.userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    return res.status(200).json({ success: true, deletedId: result.rows[0].id });
  } catch (err) {
    console.error('Error in deleteProject:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while deleting this project.' });
  }
}

// GET /api/projects/:id/pdf — streams a server-generated PDF of the
// consolidated report, ownership-checked, built entirely from already-
// persisted data (no live Groq calls).
async function downloadProjectPdf(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, project_name, industry, business_model, target_market, currency, budget,
              description, created_at, market_analysis, risk_analysis, recommendations
       FROM projects WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const project = result.rows[0];
    const safeName = (project.project_name || 'veridex-report').replace(/[^a-z0-9]/gi, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_veridex_report.pdf"`);

    generateProjectPdf(project, res);
  } catch (err) {
    console.error('Error in downloadProjectPdf:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong generating the PDF.' });
  }
}

module.exports = { createProject, listProjects, getProject, deleteProject, downloadProjectPdf };