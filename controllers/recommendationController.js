// server/backend/controllers/recommendationController.js
// Handles the Recommendations & Strategic Reasoning endpoint. Requires
// auth so the report can be persisted against the correct, owned project
// row (ownership verified before running the workflow).

const pool = require('../db/database');
const { getRecommendations } = require('../services/recommendationService');

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

async function generateRecommendations(req, res) {
  try {
    const { project, riskAnalysis, projectId } = req.body || {};

    const errors = validateInput(project || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Missing projectId.' });
    }

    const ownerCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [
      projectId,
      req.userId,
    ]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    let report;
    try {
      report = await getRecommendations(project, riskAnalysis || null);
    } catch (workflowError) {
      console.error('Recommendation workflow failed:', workflowError.message);
      return res.status(200).json({
        success: true,
        report: null,
        reportError: 'Recommendations could not be generated. Please try again later.',
      });
    }

    // Persist so the dashboard / PDF report can be built later without
    // re-running the LangGraph workflow.
    pool
      .query('UPDATE projects SET recommendations = $1 WHERE id = $2 AND user_id = $3', [
        JSON.stringify(report),
        projectId,
        req.userId,
      ])
      .catch((err) => console.error('Failed to persist recommendations:', err.message));

    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error('Error in generateRecommendations:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while generating recommendations.',
    });
  }
}

module.exports = { generateRecommendations };