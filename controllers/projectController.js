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
// first. Supports pagination via ?page=&limit= (defaults: page 1, limit
// 20, max 50) so an account with many projects doesn't pull its entire
// history into one response every time the dashboard loads.
async function listProjects(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, project_name, industry, business_model, target_market, currency, budget,
                created_at, market_analysis, risk_analysis, recommendations
         FROM projects
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.userId, limit, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM projects WHERE user_id = $1', [req.userId]),
    ]);

    const total = countResult.rows[0].total;

    return res.status(200).json({
      success: true,
      projects: rowsResult.rows,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + rowsResult.rows.length < total,
      },
    });
  } catch (err) {
    console.error('Error in listProjects:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while loading your projects.' });
  }
}

// GET /api/projects/:id — a single project, ownership-checked.
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

// POST /api/projects/:id/retry-market-analysis — data/edge-case fix: if
// the initial Groq call AND its deterministic fallback both somehow left
// market_analysis empty, the project was previously stuck with no way to
// complete it. This re-runs Market Intelligence for an existing, owned
// project using its already-stored fields, without requiring resubmission.
async function retryMarketAnalysis(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, project_name, industry, business_model, target_market, currency, budget, description
       FROM projects WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const project = result.rows[0];

    let analysis;
    try {
      analysis = await getMarketAnalysis(project);
    } catch (aiError) {
      console.error('Retry market analysis failed:', aiError.message);
      return res.status(200).json({
        success: true,
        analysis: null,
        analysisError: 'Market analysis could not be generated. Please try again later.',
      });
    }

    await pool.query('UPDATE projects SET market_analysis = $1 WHERE id = $2 AND user_id = $3', [
      JSON.stringify(analysis),
      id,
      req.userId,
    ]);

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    console.error('Error in retryMarketAnalysis:', err.message);
    return res.status(500).json({ success: false, message: 'Something went wrong while retrying the analysis.' });
  }
}

// DELETE /api/projects/:id — ownership-checked.
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

// GET /api/projects/:id/pdf
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

module.exports = {
  createProject,
  listProjects,
  getProject,
  deleteProject,
  downloadProjectPdf,
  retryMarketAnalysis,
};