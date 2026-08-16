// server/backend/controllers/recommendationController.js
// Handles the Recommendations & Strategic Reasoning endpoint. Stateless,
// same pattern as riskController — it doesn't write to the database, it
// runs the LangGraph workflow on whatever project (and optional risk
// analysis) the frontend already has cached client-side.

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
    const { project, riskAnalysis } = req.body || {};

    const errors = validateInput(project || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
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