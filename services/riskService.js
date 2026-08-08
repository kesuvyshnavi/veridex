// server/backend/services/riskService.js
// Risk Assessment, SWOT & Feasibility Engine (Milestone 2)
// Same pattern as aiService.js: try Groq first, fall back to a deterministic
// data-driven generator so the Risk Assessment page is always fully populated.

const axios = require('axios');
require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

/**
 * Builds the prompt sent to the AI based on the submitted project form data.
 * Instructs the model to return STRICT JSON so we can parse it reliably.
 *
 * The schema below powers three engine capabilities:
 *  1. Risk Scoring Engine          -> riskCategories + overallRiskScore + successProbability
 *  2. SWOT Analysis                -> swot
 *  3. Project Feasibility Assessment -> feasibility
 */
function buildPrompt(projectData) {
  const { project_name, industry, business_model, target_market, currency, budget, description } =
    projectData;

  return `
You are a startup risk analyst powering a "Risk Assessment & Strategic Evaluation Engine".
Analyze the following project and return ONLY valid JSON (no markdown, no code fences, no extra text) with this EXACT structure:

{
  "overallRiskScore": 42,
  "riskLevel": "Low | Moderate | High | Critical",
  "successProbability": 68,
  "riskCategories": {
    "businessRisk": { "score": 40, "level": "Low | Moderate | High | Critical", "factors": ["factor 1", "factor 2", "factor 3"] },
    "financialRisk": { "score": 35, "level": "Low | Moderate | High | Critical", "factors": ["factor 1", "factor 2", "factor 3"] },
    "operationalRisk": { "score": 50, "level": "Low | Moderate | High | Critical", "factors": ["factor 1", "factor 2", "factor 3"] },
    "technicalRisk": { "score": 30, "level": "Low | Moderate | High | Critical", "factors": ["factor 1", "factor 2", "factor 3"] }
  },
  "swot": {
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
    "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
    "threats": ["threat 1", "threat 2", "threat 3"]
  },
  "feasibility": {
    "overallPercentage": 74,
    "verdict": "Highly Feasible | Feasible | Moderately Feasible | Challenging",
    "breakdown": {
      "marketFeasibility": 80,
      "financialFeasibility": 65,
      "operationalFeasibility": 70,
      "technicalFeasibility": 78
    },
    "summary": "1-2 sentence explanation of the feasibility verdict"
  },
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

Rules:
- "overallRiskScore" and every riskCategories.*.score are integers 0-100, where HIGHER means MORE risk.
- "successProbability" and every feasibility.breakdown.* and feasibility.overallPercentage are integers 0-100, where HIGHER is BETTER.
- riskLevel / each category's level: Low (0-30), Moderate (31-55), High (56-75), Critical (76-100), consistent with its score.
- feasibility.verdict: Highly Feasible (75-100%), Feasible (55-74%), Moderately Feasible (35-54%), Challenging (0-34%), consistent with overallPercentage.
- "swot" arrays must have exactly 3 to 4 entries each, specific to this project (not generic filler).
- Ground financialRisk in the stated budget (${currency} ${budget}) relative to the business model and target market.
- Keep every string concise (under 20 words) since this renders in compact dashboard cards.

Project Details:
- Name: ${project_name}
- Industry/Sector: ${industry}
- Business Model: ${business_model}
- Target Market: ${target_market}
- Currency: ${currency}
- Budget: ${budget}
- Description: ${description}

Return ONLY the JSON object. Do not include any explanation before or after it.
`;
}

/**
 * Deterministic pseudo-random generator seeded from a string so the same
 * project always produces the same fallback numbers.
 */
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return function next() {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function levelForScore(score) {
  if (score <= 30) return 'Low';
  if (score <= 55) return 'Moderate';
  if (score <= 75) return 'High';
  return 'Critical';
}

function verdictForPercentage(pct) {
  if (pct >= 75) return 'Highly Feasible';
  if (pct >= 55) return 'Feasible';
  if (pct >= 35) return 'Moderately Feasible';
  return 'Challenging';
}

const BUSINESS_RISK_TEMPLATES = [
  'Crowded {industry} space makes differentiation difficult',
  'Customer trust must be earned before {model} adoption grows',
  '{target_market} buyers have long, unpredictable sales cycles',
  'Brand awareness is currently low relative to incumbents',
];

const FINANCIAL_RISK_TEMPLATES = [
  'Budget of {budget} leaves thin runway if growth is slower than planned',
  'Revenue model for {model} takes time to reach break-even',
  'Customer acquisition cost could outpace early budget assumptions',
  'Limited buffer for unexpected {industry} compliance or tooling costs',
];

const OPERATIONAL_RISK_TEMPLATES = [
  'Small team means key-person dependency in early operations',
  'Scaling {model} operations across a {target_market} base adds complexity',
  'Vendor and supply-chain dependencies are not yet diversified',
  'Onboarding and support processes are still manual at this stage',
];

const TECHNICAL_RISK_TEMPLATES = [
  'Core product still needs hardening before scale',
  'Technical stack choices for {industry} are largely unproven internally',
  'Data security and compliance tooling is still maturing',
  'Integration surface with third-party {industry} tools is untested',
];

const STRENGTH_TEMPLATES = [
  'Clear focus on {target_market} customers within {industry}',
  'A {model} model that keeps overhead lean early on',
  'Founding idea directly addresses a known {industry} pain point',
  'Budget of {budget} is earmarked specifically for validation, not overbuilding',
];

const WEAKNESS_TEMPLATES = [
  'No public traction or case studies yet to point to',
  'Small team relative to the scope of a {industry} launch',
  'Brand is unproven against established {industry} players',
  'Pricing and packaging for {model} are still untested with real buyers',
];

const OPPORTUNITY_TEMPLATES_R = [
  'Underserved pockets within the {target_market} segment',
  'Partnership potential with adjacent {industry} platforms',
  'Early-mover advantage while incumbents are slow to modernize',
  'Bundling or tiered {model} pricing to widen the funnel',
];

const THREAT_TEMPLATES = [
  'Well-funded {industry} incumbents could react quickly',
  'Shifting regulation could raise compliance costs in {industry}',
  'Customer churn risk if {model} value isn\u2019t proven fast',
  'Economic pressure could shrink {target_market} budgets industry-wide',
];

function fillTemplate(template, projectData) {
  return template
    .replace('{industry}', projectData.industry || 'this sector')
    .replace('{target_market}', (projectData.target_market || 'the target market').toLowerCase())
    .replace('{model}', projectData.business_model || 'the current')
    .replace('{budget}', `${projectData.currency || ''} ${projectData.budget || ''}`.trim());
}

function pickN(templates, projectData, rand, n) {
  return templates
    .slice()
    .sort(() => rand() - 0.5)
    .slice(0, n)
    .map((t) => fillTemplate(t, projectData));
}

/**
 * Builds a fully-populated, data-driven placeholder risk/SWOT/feasibility
 * analysis from the form fields when the live Groq call fails.
 */
function buildFallbackRiskAnalysis(projectData) {
  const { project_name, industry, business_model, budget } = projectData;
  const rand = seededRandom(project_name + industry + business_model + 'risk');

  // Rough budget-to-financial-risk scaling: smaller budgets read as riskier.
  const budgetNumberMatch = (budget || '').match(/\d+/g);
  const budgetMagnitude = budgetNumberMatch ? parseInt(budgetNumberMatch.join(''), 10) : 25;
  const budgetRiskAdj = budgetMagnitude < 10 ? 12 : budgetMagnitude < 50 ? 4 : -8;

  const businessScore = Math.round(30 + rand() * 40);
  const financialScore = Math.min(95, Math.max(5, Math.round(28 + rand() * 38 + budgetRiskAdj)));
  const operationalScore = Math.round(32 + rand() * 38);
  const technicalScore = Math.round(25 + rand() * 40);

  const overallRiskScore = Math.round(
    (businessScore + financialScore + operationalScore + technicalScore) / 4
  );
  const successProbability = Math.min(95, Math.max(5, Math.round(100 - overallRiskScore + (rand() * 10 - 5))));

  const marketFeasibility = Math.round(45 + rand() * 45);
  const financialFeasibility = Math.min(95, Math.max(10, Math.round(100 - financialScore + (rand() * 10 - 5))));
  const operationalFeasibility = Math.round(40 + rand() * 45);
  const technicalFeasibility = Math.round(45 + rand() * 45);
  const overallPercentage = Math.round(
    (marketFeasibility + financialFeasibility + operationalFeasibility + technicalFeasibility) / 4
  );

  return {
    isFallback: true,
    overallRiskScore,
    riskLevel: levelForScore(overallRiskScore),
    successProbability,
    riskCategories: {
      businessRisk: {
        score: businessScore,
        level: levelForScore(businessScore),
        factors: pickN(BUSINESS_RISK_TEMPLATES, projectData, rand, 3),
      },
      financialRisk: {
        score: financialScore,
        level: levelForScore(financialScore),
        factors: pickN(FINANCIAL_RISK_TEMPLATES, projectData, rand, 3),
      },
      operationalRisk: {
        score: operationalScore,
        level: levelForScore(operationalScore),
        factors: pickN(OPERATIONAL_RISK_TEMPLATES, projectData, rand, 3),
      },
      technicalRisk: {
        score: technicalScore,
        level: levelForScore(technicalScore),
        factors: pickN(TECHNICAL_RISK_TEMPLATES, projectData, rand, 3),
      },
    },
    swot: {
      strengths: pickN(STRENGTH_TEMPLATES, projectData, rand, 3),
      weaknesses: pickN(WEAKNESS_TEMPLATES, projectData, rand, 3),
      opportunities: pickN(OPPORTUNITY_TEMPLATES_R, projectData, rand, 3),
      threats: pickN(THREAT_TEMPLATES, projectData, rand, 3),
    },
    feasibility: {
      overallPercentage,
      verdict: verdictForPercentage(overallPercentage),
      breakdown: {
        marketFeasibility,
        financialFeasibility,
        operationalFeasibility,
        technicalFeasibility,
      },
      summary: `Based on current inputs, ${project_name} looks ${verdictForPercentage(
        overallPercentage
      ).toLowerCase()} to pursue, with financial and operational readiness as the areas to firm up first.`,
    },
    recommendations: [
      `Validate the riskiest assumption in ${industry.toLowerCase()} before committing further budget.`,
      'Build a lightweight financial model to pressure-test runway against the stated budget.',
      'Track 2-3 leading indicators weekly to catch operational risk early.',
    ],
  };
}

/**
 * Calls the Groq API and returns a parsed risk/SWOT/feasibility object.
 * Throws on failure; the caller falls back to buildFallbackRiskAnalysis.
 */
async function callGroqAPI(projectData) {
  const prompt = buildPrompt(projectData);

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      timeout: 30000,
    }
  );

  const rawText = response?.data?.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new Error('Groq API returned an empty response');
  }

  const cleanedText = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let analysis;
  try {
    analysis = JSON.parse(cleanedText);
  } catch (err) {
    console.error('Failed to parse Groq risk response:', cleanedText);
    throw new Error('Failed to parse AI risk response as JSON');
  }

  analysis.isFallback = false;
  return analysis;
}

/**
 * Always returns a complete, render-ready risk analysis object: tries Groq
 * first, and falls back to the deterministic data-driven generator if the
 * live call fails for any reason.
 */
async function getRiskAnalysis(projectData) {
  try {
    return await callGroqAPI(projectData);
  } catch (err) {
    console.error('⚠️ Groq risk analysis failed, using data-driven fallback:', err.message);
    return buildFallbackRiskAnalysis(projectData);
  }
}

module.exports = { getRiskAnalysis, buildFallbackRiskAnalysis };