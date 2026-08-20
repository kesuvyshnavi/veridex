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

  // Clear any notice left over from a previous failed attempt (e.g. this
  // is a retry) so stale error text doesn't sit visible under the status
  // flow while the new attempt runs.
  document.getElementById('noReportNotice').classList.add('hidden');

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
    // fetch() itself threw — server unreachable, not a graceful server
    // error. Only this case gets a Retry button, since re-running the
    // exact same request is likely to succeed once connectivity returns.
    console.error('Recommendation request failed:', err);
    setStepState(stepCompile, 'warn', 'Unable to reach the server');
    showNoReport(
      'Unable to reach the server. Please check your connection and try again.',
      () => runRecommendationWorkflow(data)
    );
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

// retryFn is optional — only passed for "server unreachable" failures, so
// only those get a Retry button. Server-explained failures keep their
// existing plain-message behaviour.
function showNoReport(message, retryFn) {
  if (window.VeridexStepper) window.VeridexStepper.setStep(4, 'warn');
  reportRoot.classList.remove('hidden');
  document.getElementById('noReportText').textContent = message;

  const notice = document.getElementById('noReportNotice');
  const existingRetryBtn = notice.querySelector('.status-retry-btn');
  if (existingRetryBtn) existingRetryBtn.remove();

  if (retryFn) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'status-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', retryFn);
    notice.appendChild(retryBtn);
  }

  notice.classList.remove('hidden');
  document.getElementById('capabilitiesRoot').classList.add('hidden');
}

function renderReport(report) {
  if (report.isFallback) {
    document.getElementById('fallbackBanner').classList.remove('hidden');
  }
  renderDonut('priorityDonut', 'priorityLegend', report.recommendations, 'priority', PRIORITY_COLORS, [
    'Critical',
    'High',
    'Medium',
    'Low',
  ]);
  renderDonut('impactDonut', 'impactLegend', report.riskMitigation, 'impact', IMPACT_COLORS, [
    'High',
    'Medium',
    'Low',
  ]);
  renderRecommendations(report.recommendations);
  renderMitigation(report.riskMitigation);
  renderAgentPipeline(report.agentTrace);
}

// ---------- Distribution donut charts (pure CSS conic-gradient, no chart
// library) — gives the Recommendations page its first real "at a glance"
// visualization instead of only text cards. ----------
const PRIORITY_COLORS = {
  Critical: '#DC2626',
  High: '#D97706',
  Medium: '#2563EB',
  Low: '#94A3B8',
};

const IMPACT_COLORS = {
  High: '#D97706',
  Medium: '#2563EB',
  Low: '#94A3B8',
};

function renderDonut(donutId, legendId, items, key, colorMap, order) {
  const donut = document.getElementById(donutId);
  const legend = document.getElementById(legendId);
  if (!donut || !legend) return;

  const counts = {};
  order.forEach((k) => (counts[k] = 0));
  (items || []).forEach((item) => {
    const val = item[key];
    if (counts[val] === undefined) counts[val] = 0;
    counts[val] += 1;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalEl = donut.querySelector('.rec-donut-total');
  if (totalEl) totalEl.textContent = total;

  if (total === 0) {
    donut.style.setProperty('--seg', 'conic-gradient(#EEF0F6 0% 100%)');
    legend.innerHTML = '<li>No data yet</li>';
    return;
  }

  let cursor = 0;
  const segments = [];
  order.forEach((k) => {
    const count = counts[k] || 0;
    if (!count) return;
    const pct = (count / total) * 100;
    const color = colorMap[k] || '#94A3B8';
    segments.push(`${color} ${cursor}% ${cursor + pct}%`);
    cursor += pct;
  });
  donut.style.setProperty('--seg', `conic-gradient(${segments.join(', ')})`);

  legend.innerHTML = order
    .filter((k) => counts[k])
    .map(
      (k) => `
      <li>
        <span class="rec-legend-dot" style="background:${colorMap[k] || '#94A3B8'}"></span>
        <span>${escapeHtml(k)}</span>
        <span class="rec-legend-count">${counts[k]}</span>
      </li>
    `
    )
    .join('');
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

// Renders the LangGraph execution trace as a connected pipeline diagram —
// numbered nodes on a vertical rail joined by a line that's colored per
// node status — instead of a plain list, so the agent workflow actually
// reads as a workflow.
function renderAgentPipeline(trace) {
  const panel = document.getElementById('agentTracePanel');
  if (!trace || !trace.length) {
    panel.innerHTML = '<p>—</p>';
    return;
  }
  panel.innerHTML = trace
    .map(
      (step, i) => `
      <div class="pipe-node ${step.status === 'warn' ? 'pipe-warn' : ''}">
        <div class="pipe-node-rail">
          <div class="pipe-node-dot">${TRACE_ICONS[step.node] || i + 1}</div>
          <div class="pipe-node-line"></div>
        </div>
        <div class="pipe-node-body">
          <span class="pipe-node-tag">Node ${i + 1} / ${trace.length}</span>
          <span class="pipe-node-name">${escapeHtml(step.node)}</span>
          <p class="pipe-node-detail">${escapeHtml(step.detail)}</p>
        </div>
      </div>
    `
    )
    .join('');
}