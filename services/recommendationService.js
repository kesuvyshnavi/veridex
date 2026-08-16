// server/backend/services/recommendationService.js
// Recommendations & Strategic Reasoning Engine (Milestone 3)
// Orchestrated as a LangGraph.js agent workflow: Data Ingestion -> Risk
// Analysis -> Strategic Reasoning -> Validation -> Report Generation.
// Only the Strategic Reasoning node calls Groq (via @langchain/groq,
// LangChain's chat-model wrapper) — every other node is deterministic.
// Same reliability guarantee as aiService.js / riskService.js: if the live
// Groq call fails, that node falls back to a data-driven generator instead
// of leaving the workflow incomplete, and the failure is recorded in the
// trace rather than hidden.

const { StateGraph, Annotation, START, END } = require('@langchain/langgraph');
const { ChatGroq } = require('@langchain/groq');
require('dotenv').config();

const GROQ_MODEL = 'openai/gpt-oss-120b';

// ---------- Graph state ----------
// Each node reads from and returns a partial update to this shared state.
// "trace" uses a reducer so every node APPENDS its own execution record
// instead of overwriting the previous nodes' entries — this is what powers
// the "LangGraph Agent" panel on the Recommendations page.
const RecommendationState = Annotation.Root({
  project: Annotation({ default: () => ({}) }),
  riskAnalysis: Annotation({ default: () => null }),
  ingested: Annotation({ default: () => ({}) }),
  riskSummary: Annotation({ default: () => '' }),
  recommendations: Annotation({ default: () => null }),
  isFallback: Annotation({ default: () => false }),
  validationNotes: Annotation({ default: () => [] }),
  report: Annotation({ default: () => null }),
  trace: Annotation({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

function traceEntry(node, status, detail) {
  return { node, status, detail, at: new Date().toISOString() };
}

// ---------- Node 1: Data Ingestion ----------
// Normalizes the project fields (and whatever risk-assessment output the
// frontend has cached from Milestone 2) into one consistent context object
// every downstream node reads from, instead of each node re-deriving it
// from raw input.
function dataIngestionNode(state) {
  const { project, riskAnalysis } = state;
  const ingested = {
    projectName: project.project_name || 'Untitled Project',
    industry: project.industry || 'Unspecified',
    businessModel: project.business_model || 'Unspecified',
    targetMarket: project.target_market || 'Unspecified',
    budget: `${project.currency || ''} ${project.budget || ''}`.trim(),
    description: project.description || '',
    hasRiskAnalysis: !!riskAnalysis,
  };

  return {
    ingested,
    trace: [traceEntry('Data Ingestion', 'done', 'Project and risk-assessment fields normalized.')],
  };
}

// ---------- Node 2: Risk Analysis ----------
// Distills the (optional) Milestone 2 risk/SWOT/feasibility output into a
// short plain-text summary that grounds the Strategic Reasoning prompt. If
// the person reaches Recommendations without having run Risk Assessment
// yet, this still produces a usable — if thinner — summary from the
// project fields alone, so the workflow never hard-stops.
function riskAnalysisNode(state) {
  const { riskAnalysis, ingested } = state;

  if (!riskAnalysis) {
    return {
      riskSummary: `No prior risk assessment is available. Base recommendations on the project profile alone: ${ingested.industry} sector, ${ingested.businessModel} model, targeting ${ingested.targetMarket} customers, budget ${ingested.budget}.`,
      trace: [
        traceEntry(
          'Risk Analysis',
          'warn',
          'No Milestone 2 risk data supplied — summarizing from project fields only.'
        ),
      ],
    };
  }

  const categories = riskAnalysis.riskCategories || {};
  const categoryLines = Object.entries(categories)
    .map(([key, cat]) => `${key} = ${cat.score}/100 (${cat.level})`)
    .join(', ');

  const topWeaknesses = (riskAnalysis.swot && riskAnalysis.swot.weaknesses) || [];
  const topThreats = (riskAnalysis.swot && riskAnalysis.swot.threats) || [];

  const summary = `Overall risk ${riskAnalysis.overallRiskScore}/100 (${riskAnalysis.riskLevel}), estimated success probability ${riskAnalysis.successProbability}%. Category scores: ${categoryLines}. Feasibility: ${
    riskAnalysis.feasibility
      ? riskAnalysis.feasibility.overallPercentage + '% - ' + riskAnalysis.feasibility.verdict
      : 'not available'
  }. Key weaknesses: ${topWeaknesses.join('; ') || 'none listed'}. Key threats: ${
    topThreats.join('; ') || 'none listed'
  }.`;

  return {
    riskSummary: summary,
    trace: [
      traceEntry('Risk Analysis', 'done', 'Risk categories, SWOT and feasibility distilled into a grounding summary.'),
    ],
  };
}

// ---------- Prompt for Node 3 ----------
function buildPrompt(ingested, riskSummary) {
  return `
You are a startup strategy advisor powering a "Recommendations & Strategic Reasoning Engine".
Given the project profile and risk summary below, return ONLY valid JSON (no markdown, no code fences, no extra text) with this EXACT structure:

{
  "recommendations": [
    { "title": "short action title", "priority": "Critical | High | Medium | Low", "rationale": "1-2 sentence why this matters now" }
  ],
  "riskMitigation": [
    { "risk": "the specific risk being addressed", "strategy": "1-2 sentence mitigation strategy", "impact": "High | Medium | Low" }
  ]
}

Rules:
- "recommendations" must have exactly 4 to 5 entries, ordered by priority (Critical/High first), specific to this project — not generic startup advice.
- "riskMitigation" must have exactly 3 to 4 entries, each tied to a concrete risk implied by the risk summary below.
- Keep every string concise (under 22 words) since this renders in compact dashboard cards.

Project Profile:
- Name: ${ingested.projectName}
- Industry/Sector: ${ingested.industry}
- Business Model: ${ingested.businessModel}
- Target Market: ${ingested.targetMarket}
- Budget: ${ingested.budget}
- Description: ${ingested.description}

Risk Summary:
${riskSummary}

Return ONLY the JSON object. Do not include any explanation before or after it.
`;
}

function cleanJson(rawText) {
  return rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

// Deterministic fallback so the report is always fully populated, following
// the exact same pattern as buildFallbackAnalysis() / buildFallbackRiskAnalysis().
function buildFallbackRecommendations(ingested) {
  const sector = (ingested.industry || 'this sector').toLowerCase();
  return {
    recommendations: [
      {
        title: `Run 5-10 customer interviews in ${(ingested.targetMarket || 'the target market').toLowerCase()}`,
        priority: 'Critical',
        rationale: 'Validates demand before committing more of the stated budget.',
      },
      {
        title: `Ship a narrow MVP focused on one ${sector} workflow`,
        priority: 'High',
        rationale: 'Gets real usage data faster than building the full feature set.',
      },
      {
        title: 'Define 2-3 leading indicators to track weekly',
        priority: 'High',
        rationale: 'Catches operational or financial drift early, before it compounds.',
      },
      {
        title: `Benchmark pricing against the closest ${sector} competitor`,
        priority: 'Medium',
        rationale: 'Finds a defensible wedge instead of competing purely on price.',
      },
      {
        title: 'Document a fallback plan if the primary channel underperforms',
        priority: 'Medium',
        rationale: 'Keeps runway intact if early assumptions prove wrong.',
      },
    ],
    riskMitigation: [
      {
        risk: 'Limited runway relative to budget',
        strategy: 'Stage spend in 6-8 week checkpoints tied to validation milestones.',
        impact: 'High',
      },
      {
        risk: 'Unproven demand in target segment',
        strategy: 'Pre-sell or waitlist before building beyond the MVP.',
        impact: 'High',
      },
      {
        risk: 'Small team, key-person dependency',
        strategy: "Document core processes early so knowledge isn't siloed.",
        impact: 'Medium',
      },
      {
        risk: 'Competitive response from incumbents',
        strategy: 'Lean into a narrow wedge incumbents are slow to defend.',
        impact: 'Medium',
      },
    ],
  };
}

// ---------- Node 3: Strategic Reasoning (calls Groq via LangGraph) ----------
async function strategicReasoningNode(state) {
  const { ingested, riskSummary } = state;
  const prompt = buildPrompt(ingested, riskSummary);

  try {
    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: GROQ_MODEL,
      temperature: 0.4,
    });

    const response = await model.invoke(prompt);
    const rawText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const parsed = JSON.parse(cleanJson(rawText));

    if (!Array.isArray(parsed.recommendations) || !Array.isArray(parsed.riskMitigation)) {
      throw new Error('Groq response missing required arrays');
    }

    return {
      recommendations: parsed,
      isFallback: false,
      trace: [
        traceEntry(
          'Strategic Reasoning',
          'done',
          'Groq (openai/gpt-oss-120b) generated recommendations and mitigation strategies.'
        ),
      ],
    };
  } catch (err) {
    console.error('⚠️ Strategic Reasoning node: Groq call failed, using data-driven fallback:', err.message);
    return {
      recommendations: buildFallbackRecommendations(ingested),
      isFallback: true,
      trace: [
        traceEntry('Strategic Reasoning', 'warn', `Groq call failed (${err.message}); used deterministic fallback.`),
      ],
    };
  }
}

// ---------- Node 4: Validation ----------
// Deterministic guardrail: makes sure the shape is safe to render even if
// Groq returned something malformed-but-parseable (wrong enum values,
// missing fields, etc.), and patches it in place rather than failing the
// whole workflow.
const VALID_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const VALID_IMPACTS = ['High', 'Medium', 'Low'];

function validationNode(state) {
  const notes = [];
  const data = state.recommendations || { recommendations: [], riskMitigation: [] };

  let recs = Array.isArray(data.recommendations) ? data.recommendations.slice(0, 5) : [];
  recs = recs.map((r) => {
    if (!VALID_PRIORITIES.includes(r.priority)) {
      notes.push(`Recommendation "${r.title || 'untitled'}" had an invalid priority — defaulted to Medium.`);
      return { ...r, priority: 'Medium' };
    }
    return r;
  });
  if (recs.length < 3) {
    notes.push('Fewer than 3 recommendations were returned by the model.');
  }

  let mitigations = Array.isArray(data.riskMitigation) ? data.riskMitigation.slice(0, 4) : [];
  mitigations = mitigations.map((m) => {
    if (!VALID_IMPACTS.includes(m.impact)) {
      notes.push(`Mitigation for "${m.risk || 'unspecified risk'}" had an invalid impact — defaulted to Medium.`);
      return { ...m, impact: 'Medium' };
    }
    return m;
  });

  return {
    recommendations: { recommendations: recs, riskMitigation: mitigations },
    validationNotes: notes,
    trace: [
      traceEntry(
        'Validation',
        notes.length ? 'warn' : 'done',
        notes.length ? `${notes.length} field(s) auto-corrected.` : 'All fields within expected shape and value ranges.'
      ),
    ],
  };
}

// ---------- Node 5: Report Generation ----------
function reportGenerationNode(state) {
  const report = {
    isFallback: state.isFallback,
    recommendations: state.recommendations.recommendations,
    riskMitigation: state.recommendations.riskMitigation,
    validationNotes: state.validationNotes,
    generatedAt: new Date().toISOString(),
  };

  return {
    report,
    trace: [traceEntry('Report Generation', 'done', 'Final recommendations report compiled and ready to render.')],
  };
}

// ---------- Build & compile the graph once at module load ----------
const workflow = new StateGraph(RecommendationState)
  .addNode('dataIngestion', dataIngestionNode)
  .addNode('analyzeRisk', riskAnalysisNode)
  .addNode('strategicReasoning', strategicReasoningNode)
  .addNode('validation', validationNode)
  .addNode('reportGeneration', reportGenerationNode)
  .addEdge(START, 'dataIngestion')
  .addEdge('dataIngestion', 'analyzeRisk')
  .addEdge('analyzeRisk', 'strategicReasoning')
  .addEdge('strategicReasoning', 'validation')
  .addEdge('validation', 'reportGeneration')
  .addEdge('reportGeneration', END);

const compiledGraph = workflow.compile();

/**
 * Runs the full LangGraph agent workflow for a project (and optional
 * Milestone 2 risk analysis) and returns the compiled report, including
 * the node-by-node execution trace used by the "LangGraph Agent" panel.
 */
async function getRecommendations(project, riskAnalysis) {
  const result = await compiledGraph.invoke({ project, riskAnalysis: riskAnalysis || null });
  return { ...result.report, agentTrace: result.trace };
}

module.exports = { getRecommendations };