// server/backend/public/js/recommendation.js
// Renders the "Recommendations & Strategic Reasoning Engine" (Milestone 3)
// for the most recently submitted project. Reuses veridexResult (project +
// market analysis) from main.js and veridexRiskResult (Milestone 2 output,
// if present) from risk.js, then calls POST /api/recommendations, which
// runs a LangGraph.js agent workflow server-side.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const emptyState = document.getElementById('emptyState');
const reportRoot = document.getElementById('reportRoot');
const statusBox = document.getElementById('statusBox');
const stepWorkflow = document.getElementById('stepWorkflow');
const stepCompile = document.getElementById('stepCompile');

function setStepState(stepEl, state, text) {
  stepEl.classList.remove('is-active', 'is-done', 'is-warn');
  if (state) stepEl.classList.add(`is-${state}`);
  if (text) stepEl.querySelector('.status-step-text').textContent = text;
}

const raw = sessionStorage.getItem('veridexResult');

if (!raw) {
  emptyState.classList.remove('hidden');
} else {
  try {
    const data = JSON.parse(raw);
    runRecommendationWorkflow(data);
  } catch (err) {
    console.error('Failed to parse stored project:', err);
    emptyState.classList.remove('hidden');
  }
}

function getCachedRiskAnalysis() {
  const rawRisk = sessionStorage.getItem('veridexRiskResult');
  if (!rawRisk) return null;
  try {
    const parsed = JSON.parse(rawRisk);
    return parsed.analysis || null;
  } catch (err) {
    return null;
  }
}

async function runRecommendationWorkflow(data) {
  const { project, submittedAt } = data;
  const riskAnalysis = getCachedRiskAnalysis();

  renderMetaHeader(project, submittedAt, !!riskAnalysis);

  statusBox.classList.remove('hidden');
  setStepState(stepWorkflow, 'active', 'Running LangGraph agent workflow…');
  setStepState(stepCompile, null, 'Validating & compiling report…');

  try {
    const response = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, riskAnalysis }),
    });
    const result = await response.json();

    setStepState(stepWorkflow, 'done', 'Agent workflow executed');
    setStepState(stepCompile, 'active', 'Validating & compiling report…');
    await wait(500);

    if (!response.ok || !result.success) {
      setStepState(stepCompile, 'warn', 'Could not complete workflow');
      showNoReport(result.message || 'Recommendations could not be generated.');
      return;
    }

    if (!result.report) {
      setStepState(stepCompile, 'warn', 'Report unavailable');
      showNoReport(result.reportError || 'Recommendations are not available for this project yet.');
      return;
    }

    setStepState(stepCompile, 'done', 'Report ready');
    await wait(300);
    statusBox.classList.add('hidden');

    reportRoot.classList.remove('hidden');
    renderReport(result.report);
    if (window.VeridexStepper) window.VeridexStepper.setStep(4, 'done');
  } catch (err) {
    console.error('Recommendation request failed:', err);
    setStepState(stepCompile, 'warn', 'Unable to reach the server');
    showNoReport('Unable to reach the server. Please check your connection and try again.');
  }
}

function renderMetaHeader(project, submittedAt, hasRiskAnalysis) {
  document.getElementById('projectName').textContent = project.project_name || 'Untitled Project';
  const tagRow = document.getElementById('tagRow');
  const tags = [project.industry, project.business_model, project.target_market, project.budget];
  tagRow.innerHTML = tags
    .filter(Boolean)
    .map((t) => `<span class="vrx-tag">${escapeHtml(t)}</span>`)
    .join('');
  void submittedAt; // reserved for parity with results.js / risk.js

  if (!hasRiskAnalysis) {
    document.getElementById('noRiskBanner').classList.remove('hidden');
  }
}

function showNoReport(message) {
  if (window.VeridexStepper) window.VeridexStepper.setStep(4, 'warn');
  reportRoot.classList.remove('hidden');
  document.getElementById('noReportText').textContent = message;
  document.getElementById('noReportNotice').classList.remove('hidden');
  document.getElementById('capabilitiesRoot').classList.add('hidden');
}

function renderReport(report) {
  if (report.isFallback) {
    document.getElementById('fallbackBanner').classList.remove('hidden');
  }
  renderRecommendations(report.recommendations);
  renderMitigation(report.riskMitigation);
  renderAgentTrace(report.agentTrace);
}

function priorityClass(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical':
      return 'vrx-badge-warn';
    case 'high':
      return 'vrx-badge-warn';
    case 'medium':
      return 'vrx-badge-info';
    default:
      return 'vrx-badge-neutral';
  }
}

function renderRecommendations(items) {
  const panel = document.getElementById('recommendationsPanel');
  if (!items || !items.length) {
    panel.innerHTML = '<p>—</p>';
    return;
  }
  panel.innerHTML = items
    .map(
      (item) => `
      <div class="rec-card">
        <div class="rec-card-head">
          <span class="rec-card-title">${escapeHtml(item.title)}</span>
          <span class="vrx-badge ${priorityClass(item.priority)}">${escapeHtml(item.priority || '—')}</span>
        </div>
        <p class="rec-card-body">${escapeHtml(item.rationale || '')}</p>
      </div>
    `
    )
    .join('');
}

function impactClass(impact) {
  switch ((impact || '').toLowerCase()) {
    case 'high':
      return 'vrx-badge-warn';
    case 'medium':
      return 'vrx-badge-info';
    default:
      return 'vrx-badge-neutral';
  }
}

function renderMitigation(items) {
  const panel = document.getElementById('mitigationPanel');
  if (!items || !items.length) {
    panel.innerHTML = '<p>—</p>';
    return;
  }
  panel.innerHTML = items
    .map(
      (item) => `
      <div class="rec-card">
        <div class="rec-card-head">
          <span class="rec-card-title">${escapeHtml(item.risk)}</span>
          <span class="vrx-badge ${impactClass(item.impact)}">${escapeHtml(item.impact || '—')} impact</span>
        </div>
        <p class="rec-card-body">${escapeHtml(item.strategy || '')}</p>
      </div>
    `
    )
    .join('');
}

const TRACE_ICONS = {
  'Data Ingestion': '⇩',
  'Risk Analysis': '◈',
  'Strategic Reasoning': '✦',
  Validation: '✓',
  'Report Generation': '▤',
};

function renderAgentTrace(trace) {
  const panel = document.getElementById('agentTracePanel');
  if (!trace || !trace.length) {
    panel.innerHTML = '<p>—</p>';
    return;
  }
  panel.innerHTML = trace
    .map(
      (step) => `
      <div class="trace-step trace-${step.status}">
        <span class="trace-icon">${TRACE_ICONS[step.node] || '•'}</span>
        <div>
          <span class="trace-node">${escapeHtml(step.node)}</span>
          <p class="trace-detail">${escapeHtml(step.detail)}</p>
        </div>
      </div>
    `
    )
    .join('');
}