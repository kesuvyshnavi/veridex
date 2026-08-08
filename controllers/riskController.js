// server/backend/controllers/riskController.js
// Handles the Risk Assessment / SWOT / Feasibility endpoint.
// Note: unlike projectController, this does NOT write to the database —
// it mirrors how the Market Intelligence analysis works today (computed
// on request from the project fields already saved in the browser's
// sessionStorage), so behaviour stays consistent across both engines.

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
    const errors = validateInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
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