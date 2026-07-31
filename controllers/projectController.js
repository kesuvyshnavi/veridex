// server/controllers/projectController.js
// Handles validation, DB insertion, and triggering ai analysis

const pool = require('../db/database');
const { getMarketAnalysis } = require('../services/aiService');

// Allowed dropdown values (should match frontend dropdown options)
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

    // STEP 1: Validate
    const errors = validateProjectInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // STEP 2: Insert into PostgreSQL
    const insertQuery = `
      INSERT INTO projects (project_name, industry, business_model, target_market, currency, budget, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `;
    const values = [project_name, industry, business_model, target_market, currency, budget, description];

    const dbResult = await pool.query(insertQuery, values);
    const projectId = dbResult.rows[0].id;

    // STEP 3: Only after successful DB insert, call ai for analysis
    let analysis;
    try {
      analysis = await getMarketAnalysis(req.body);
    } catch (aiError) {
      console.error('ai analysis failed:', aiError.message);
      // Project is already saved successfully — inform frontend that analysis failed,
      // but do NOT fail the whole request since DB save succeeded.
      return res.status(201).json({
        success: true,
        projectId,
        analysis: null,
        analysisError: 'Market analysis could not be generated. Please try again later.',
      });
    }

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

module.exports = { createProject };