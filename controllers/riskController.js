// server/backend/controllers/riskController.js
// Handles the Risk Assessment / SWOT / Feasibility endpoint. Requires auth
// so the analysis can be persisted against the correct project row, and
// ownership is verified before any DB write happens.

const pool = require('../db/database');
const { getRiskAnalysis } = require('../services/riskService');

const REQUIRED_FIELDS = [
  'project_name',
  'industry',
  'business_model',
  'target_market',
  'currency',
  'budget',
  'description',
];

function validateInput(data) {
  const errors = [];
  REQUIRED_FIELDS.forEach((field) => {
    if (!data[field] || String(data[field]).trim().length === 0) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  return errors;
}

async function generateRiskAnalysis(req, res) {
  try {
    const { projectId } = req.body || {};

    const errors = validateInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Missing projectId.' });
    }

    // Ownership check: this project must belong to the logged-in user
    // before we generate or persist anything against it.
    const ownerCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [
      projectId,
      req.userId,
    ]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    let analysis;
    try {
      analysis = await getRiskAnalysis(req.body);
    } catch (aiError) {
      console.error('Risk analysis failed:', aiError.message);
      return res.status(200).json({
        success: true,
        analysis: null,
        analysisError: 'Risk assessment could not be generated. Please try again later.',
      });
    }

    // Persist so the dashboard / PDF report can be built later without
    // re-calling Groq. Best-effort: if this fails, the response to the
    // user is unaffected.
    pool
      .query('UPDATE projects SET risk_analysis = $1 WHERE id = $2 AND user_id = $3', [
        JSON.stringify(analysis),
        projectId,
        req.userId,
      ])
      .catch((err) => console.error('Failed to persist risk_analysis:', err.message));

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    console.error('Error in generateRiskAnalysis:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while generating the risk assessment.',
    });
  }
}

module.exports = { generateRiskAnalysis };