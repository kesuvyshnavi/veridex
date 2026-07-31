// server/backend/services/aiService.js
// Market & Competitor Intelligence Engine
// Handles communication with the Groq API and provides a data-driven
// fallback so the results page is ALWAYS fully populated for demos.

const axios = require('axios');
require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b'; // Groq's current recommended general-purpose model

// Maps each supported currency code to the symbol/abbreviation and the
// "big number" denomination it should be expressed in, plus the locale used
// for thousand-separator formatting in the fallback generator. INR uses
// "Cr" (Crore) as is standard in Indian business contexts; everything else
// uses "M" (Million), which is the common international convention.
const CURRENCY_META = {
  INR: { symbol: '₹', unit: 'Cr', locale: 'en-IN' },
  USD: { symbol: '$', unit: 'M', locale: 'en-US' },
  EUR: { symbol: '€', unit: 'M', locale: 'en-US' },
  GBP: { symbol: '£', unit: 'M', locale: 'en-US' },
  AED: { symbol: 'AED ', unit: 'M', locale: 'en-US' },
};

function getCurrencyMeta(currency) {
  return CURRENCY_META[currency] || CURRENCY_META.INR;
}

/**
 * Builds the prompt sent to the AI based on the submitted project form data.
 * Instructs the model to return STRICT JSON so we can parse it reliably.
 *
 * The schema below powers three engine capabilities:
 *  1. Target market characteristics  -> marketCharacteristics + marketSize
 *  2. Key competitors & challenges   -> competitors + industryChallenges
 *  3. Opportunities & growth outlook -> opportunities + growthPotential + historicalGrowth
 */
function buildPrompt(projectData) {
  const { project_name, industry, business_model, target_market, currency, budget, description } =
    projectData;
  const meta = getCurrencyMeta(currency);
  const exampleTam = `${meta.symbol}18,500 ${meta.unit}`.trim();
  const exampleSam = `${meta.symbol}6,200 ${meta.unit}`.trim();
  const exampleSom = `${meta.symbol}92 ${meta.unit}`.trim();

  return `
You are a startup market research analyst powering a "Market & Competitor Intelligence Engine".
Analyze the following project and return ONLY valid JSON (no markdown, no code fences, no extra text) with this EXACT structure:

{
  "marketOverview": "2-3 sentence summary of the market this project competes in",
  "marketCharacteristics": {
    "targetAudienceProfile": "1-2 sentence description of the target audience",
    "marketMaturity": "Emerging | Growing | Mature | Declining",
    "keyDrivers": ["driver 1", "driver 2", "driver 3"]
  },
  "marketSize": {
    "tam": "e.g. ${exampleTam}",
    "sam": "e.g. ${exampleSam}",
    "som": "e.g. ${exampleSom}",
    "growthRate": "e.g. 11.3% YoY"
  },
  "historicalGrowth": [
    {"year": 2021, "value": 55},
    {"year": 2022, "value": 68},
    {"year": 2023, "value": 79},
    {"year": 2024, "value": 90},
    {"year": 2025, "value": 100}
  ],
  "competitors": [
    {
      "name": "Competitor name",
      "marketShare": 25,
      "position": "Leader | Direct | Indirect",
      "strength": "1 short phrase",
      "weakness": "1 short phrase"
    }
  ],
  "industryChallenges": ["challenge 1", "challenge 2", "challenge 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "growthPotential": {
    "score": 72,
    "summary": "1-2 sentence explanation of the growth potential score (0-100)"
  },
  "readinessScores": {
    "marketValidation": 65,
    "competitivePosition": 55,
    "financialModel": 60,
    "technicalReadiness": 70
  },
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}

Rules:
- The project's currency is "${currency}". ALL monetary figures (marketSize.tam, marketSize.sam, marketSize.som, and every value implied by "historicalGrowth") MUST be expressed in "${currency}" using the format "${meta.symbol}<number> ${meta.unit}" (e.g. "${exampleTam}") — do not mix currencies or use a different denomination.
- "historicalGrowth" must have exactly 5 points for the past 5 calendar years ending at the current year, values trending upward, representing relative market size in the same ${currency} ${meta.unit} unit as marketSize.tam — the last/most recent point's value should roughly equal the numeric part of tam.
- "competitors" must have 3 to 4 entries, ordered by marketShare descending.
- All numeric scores are integers from 0-100.
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
 * project name always produces the same fallback numbers (feels "real"
 * across repeated demo runs instead of jumping around randomly).
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

const INDUSTRY_COMPETITOR_NAMES = {
  Technology: ['TechCore Systems', 'NimbusStack', 'ByteForge Labs', 'Quantify.io'],
  Healthcare: ['HealthtechLab', 'NorthHeal', 'Lumenwise', 'VitalPath'],
  Finance: ['FinEdge Capital', 'LedgerPoint', 'ClearVault', 'Payflow Systems'],
  'E-commerce': ['Flipkart', 'Meesho', 'Myntra', 'Ajio'],
  Education: ['LearnLoop', 'EduSpire', 'ClassNext', 'SkillHarbor'],
  Agriculture: ['AgroSense', 'FarmLink', 'CropIQ', 'HarvestNet'],
  Manufacturing: ['ForgeWorks', 'IronLoop Industries', 'AssemblyOne', 'ProdCore'],
  Other: ['MarketLeader Co.', 'Runner-Up Inc.', 'NicheChallenger', 'LegacyCorp'],
};

const CHALLENGE_TEMPLATES = [
  'High customer acquisition cost relative to {industry} margins',
  'Regulatory and compliance overhead specific to {industry}',
  'Fragmented vendor/supplier landscape slowing integration',
  'Low switching cost lets customers churn to competitors easily',
  'Talent scarcity for specialized {industry} skill sets',
];

const OPPORTUNITY_TEMPLATES = [
  'Underserved segment within the {target_market} audience',
  'Bundling {model} pricing to lock in early adopters',
  'Partnership potential with adjacent {industry} platforms',
  'Expansion path from {target_market} into new geographies',
  'Automation reduces operating cost faster than incumbents',
];

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function fillTemplate(template, projectData) {
  return template
    .replace('{industry}', projectData.industry || 'this sector')
    .replace('{target_market}', projectData.target_market || 'the target market')
    .replace('{model}', projectData.business_model || 'the current');
}

/**
 * Builds a fully-populated, data-driven placeholder analysis from the form
 * fields when the live Groq call fails, so the results dashboard always
 * has something coherent to render for demos.
 */
function buildFallbackAnalysis(projectData) {
  const { project_name, industry, business_model, target_market, currency, budget, description } =
    projectData;

  const meta = getCurrencyMeta(currency);
  const rand = seededRandom(project_name + industry + business_model);

  // Rough budget-to-market-size scaling so numbers feel proportional.
  const budgetNumberMatch = (budget || '').match(/\d+/g);
  const budgetMagnitude = budgetNumberMatch ? parseInt(budgetNumberMatch.join(''), 10) : 25;
  const somBase = Math.max(10, Math.round(budgetMagnitude * (2 + rand() * 3)));
  const samBase = somBase * Math.round(20 + rand() * 30);
  const tamBase = samBase * Math.round(4 + rand() * 6);

  // Build the past 5 years working BACKWARD from the current tamBase, so the
  // most recent year lines up with marketSize.tam instead of projecting
  // forward into the future (which produced an unusable/misleading chart).
  const historicalGrowth = [];
  const currentYear = new Date().getFullYear();
  const yearlyGrowth = 1.10 + rand() * 0.08; // ~10-18% YoY historical growth
  const values = [];
  let val = tamBase;
  for (let i = 0; i < 5; i++) {
    values.unshift(Math.round(val));
    val = val / yearlyGrowth;
  }
  for (let i = 0; i < 5; i++) {
    historicalGrowth.push({ year: currentYear - 4 + i, value: values[i] });
  }

  const namesPool = INDUSTRY_COMPETITOR_NAMES[industry] || INDUSTRY_COMPETITOR_NAMES.Other;
  const shares = [Math.round(22 + rand() * 12), Math.round(10 + rand() * 10), Math.round(6 + rand() * 8), Math.round(3 + rand() * 5)];
  const positions = ['Leader', 'Direct', 'Direct', 'Indirect'];
  const strengths = ['Established brand & distribution', 'Modern UX, strong community', 'Enterprise contracts', 'Scale & capital reserves'];
  const weaknesses = ['Slow to ship, aging UX', 'Thin margins, limited integrations', 'Poor SMB fit, opaque pricing', "Innovator's dilemma"];

  const competitors = namesPool.map((name, i) => ({
    name,
    marketShare: shares[i],
    position: positions[i],
    strength: strengths[i],
    weakness: weaknesses[i],
  })).sort((a, b) => b.marketShare - a.marketShare);

  const industryChallenges = CHALLENGE_TEMPLATES
    .slice()
    .sort(() => rand() - 0.5)
    .slice(0, 3)
    .map((t) => fillTemplate(t, projectData));

  const opportunities = OPPORTUNITY_TEMPLATES
    .slice()
    .sort(() => rand() - 0.5)
    .slice(0, 3)
    .map((t) => fillTemplate(t, projectData));

  const growthScore = Math.round(50 + rand() * 40);

  return {
    isFallback: true,
    marketOverview: `${project_name} enters the ${industry} space with a ${business_model} model targeting ${target_market.toLowerCase()} customers. Early signals suggest a growing addressable market with room for a differentiated entrant.`,
    marketCharacteristics: {
      targetAudienceProfile: `${target_market} customers seeking a modern alternative in ${industry.toLowerCase()}, currently underserved by legacy players.`,
      marketMaturity: rand() > 0.5 ? 'Growing' : 'Emerging',
      keyDrivers: [
        `Rising demand for digital-first ${industry.toLowerCase()} solutions`,
        `Increasing budget allocation toward ${business_model} offerings`,
        'Shifting customer expectations around speed and transparency',
      ],
    },
    marketSize: {
      tam: `${meta.symbol}${tamBase.toLocaleString(meta.locale)} ${meta.unit}`.trim(),
      sam: `${meta.symbol}${samBase.toLocaleString(meta.locale)} ${meta.unit}`.trim(),
      som: `${meta.symbol}${somBase.toLocaleString(meta.locale)} ${meta.unit}`.trim(),
      growthRate: `${(8 + rand() * 8).toFixed(1)}% YoY`,
    },
    historicalGrowth,
    competitors,
    industryChallenges,
    opportunities,
    growthPotential: {
      score: growthScore,
      summary: `Based on market maturity, budget, and competitive density, ${project_name} shows ${growthScore >= 70 ? 'strong' : growthScore >= 50 ? 'moderate' : 'early-stage'} growth potential over the next 3-5 years.`,
    },
    readinessScores: {
      marketValidation: Math.round(40 + rand() * 40),
      competitivePosition: Math.round(35 + rand() * 40),
      financialModel: Math.round(40 + rand() * 40),
      technicalReadiness: Math.round(45 + rand() * 40),
    },
    suggestions: [
      `Run 10-15 customer discovery interviews within the ${target_market.toLowerCase()} segment before scaling spend.`,
      `Benchmark pricing against ${competitors[0].name} to find a defensible wedge.`,
      'Validate unit economics at small scale before committing the full budget.',
    ],
  };
}

/**
 * Pulls just the numeric magnitude out of a monetary string the AI (or the
 * fallback generator) produced — regardless of what currency symbol/unit it
 * used — and rebuilds it using the project's ACTUAL chosen currency. This
 * guards against the AI ignoring the currency instruction in the prompt
 * (which large language models occasionally do) and defaulting back to ₹.
 */
function normalizeMonetaryValue(rawValue, currency) {
  if (!rawValue) return rawValue;
  const meta = getCurrencyMeta(currency);
  const match = String(rawValue).match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return rawValue;
  const numericValue = parseFloat(match[1].replace(/,/g, ''));
  if (Number.isNaN(numericValue)) return rawValue;
  return `${meta.symbol}${numericValue.toLocaleString(meta.locale)} ${meta.unit}`.trim();
}

/**
 * Re-stamps marketSize.tam/sam/som with the correct currency symbol & unit,
 * no matter which currency the underlying analysis (AI or fallback) used.
 */
function normalizeAnalysisCurrency(analysis, currency) {
  if (analysis && analysis.marketSize) {
    analysis.marketSize.tam = normalizeMonetaryValue(analysis.marketSize.tam, currency);
    analysis.marketSize.sam = normalizeMonetaryValue(analysis.marketSize.sam, currency);
    analysis.marketSize.som = normalizeMonetaryValue(analysis.marketSize.som, currency);
  }
  return analysis;
}

/**
 * Calls the Groq API and returns a parsed analysis object.
 * Throws an error if the API call fails or the response can't be parsed
 * (the caller, getMarketAnalysis, falls back to buildFallbackAnalysis).
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

  // Clean up in case the model wraps JSON in ```json ... ``` fences
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
    console.error('Failed to parse Groq response:', cleanedText);
    throw new Error('Failed to parse AI response as JSON');
  }

  analysis.isFallback = false;
  return analysis;
}

/**
 * Always returns a complete, render-ready analysis object: tries Groq first,
 * and falls back to the deterministic data-driven generator if the live
 * call fails for any reason (network issue, rate limit, bad JSON, outage).
 * Either way, the currency of marketSize.tam/sam/som is force-normalized
 * to match what the person actually selected in the form — the AI's
 * instruction-following on currency isn't 100% reliable, so we don't trust
 * it blindly; we just take its numbers and re-label them ourselves.
 */
async function getMarketAnalysis(projectData) {
  let analysis;
  try {
    analysis = await callGroqAPI(projectData);
  } catch (err) {
    console.error('⚠️ Groq analysis failed, using data-driven fallback:', err.message);
    analysis = buildFallbackAnalysis(projectData);
  }
  return normalizeAnalysisCurrency(analysis, projectData.currency);
}

module.exports = { getMarketAnalysis, buildFallbackAnalysis };