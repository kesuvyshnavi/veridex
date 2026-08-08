// server/backend/public/js/risk.js
// Renders the "Risk Assessment & Strategic Evaluation Engine" report
// (Milestone 2) for the most recently submitted project. Reuses the same
// sessionStorage payload main.js already wrote for results.html, then
// calls POST /api/risk-analysis to generate risk + SWOT + feasibility.

const GAUGE_PATH_LENGTH = 226; // matches the arc path length used in risk.html

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatAnalyzedDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const emptyState = document.getElementById('emptyState');
const reportRoot = document.getElementById('reportRoot');
const statusBox = document.getElementById('statusBox');
const stepAssess = document.getElementById('stepAssess');
const stepFeasibility = document.getElementById('stepFeasibility');

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
    runRiskAssessment(data);
  } catch (err) {
    console.error('Failed to parse stored project:', err);
    emptyState.classList.remove('hidden');
  }
}

async function runRiskAssessment(data) {
  const { project, submittedAt } = data;

  renderMetaHeader(project, submittedAt);

  statusBox.classList.remove('hidden');
  setStepState(stepAssess, 'active', 'Evaluating risk factors…');
  setStepState(stepFeasibility, null, 'Building SWOT & feasibility…');

  try {
    const response = await fetch('/api/risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const result = await response.json();

    setStepState(stepAssess, 'done', 'Risk factors evaluated');
    setStepState(stepFeasibility, 'active', 'Building SWOT & feasibility…');
    await wait(500);

    if (!response.ok || !result.success) {
      setStepState(stepFeasibility, 'warn', 'Could not complete assessment');
      showNoAnalysis(result.message || 'Risk assessment could not be generated.');
      return;
    }

    if (!result.analysis) {
      setStepState(stepFeasibility, 'warn', 'Analysis unavailable');
      showNoAnalysis(result.analysisError || 'Risk assessment is not available for this project yet.');
      return;
    }

    setStepState(stepFeasibility, 'done', 'SWOT & feasibility ready');
    await wait(300);
    statusBox.classList.add('hidden');

    reportRoot.classList.remove('hidden');
    renderAnalysis(result.analysis);
  } catch (err) {
    console.error('Risk analysis request failed:', err);
    setStepState(stepFeasibility, 'warn', 'Unable to reach the server');
    showNoAnalysis('Unable to reach the server. Please check your connection and try again.');
  }
}

function renderMetaHeader(project, submittedAt) {
  document.getElementById('projectName').textContent = project.project_name || 'Untitled Project';
  const tagRow = document.getElementById('tagRow');
  const tags = [project.industry, project.business_model, project.target_market, project.budget];
  tagRow.innerHTML = tags
    .filter(Boolean)
    .map((t) => `<span class="vrx-tag">${escapeHtml(t)}</span>`)
    .join('');
  void formatAnalyzedDate(submittedAt); // reserved for future use (kept for parity with results.js)
}

function showNoAnalysis(message) {
  reportRoot.classList.remove('hidden');
  document.getElementById('noAnalysisText').textContent = message;
  document.getElementById('noAnalysisNotice').classList.remove('hidden');
  document.getElementById('capabilitiesRoot').classList.add('hidden');
}

function renderAnalysis(analysis) {
  if (analysis.isFallback) {
    document.getElementById('fallbackBanner').classList.remove('hidden');
  }

  renderRiskGauge(analysis.overallRiskScore, analysis.riskLevel, analysis.successProbability);
  renderCategories(analysis.riskCategories);
  renderSwot(analysis.swot);
  renderFeasibility(analysis.feasibility);
  renderList('recommendationsList', analysis.recommendations);
}

function levelClass(level) {
  switch ((level || '').toLowerCase()) {
    case 'low': return 'rsk-level-low';
    case 'moderate': return 'rsk-level-moderate';
    case 'high': return 'rsk-level-high';
    case 'critical': return 'rsk-level-critical';
    default: return 'rsk-level-low';
  }
}

function colorForLevel(level) {
  switch ((level || '').toLowerCase()) {
    case 'low': return '#16A34A';
    case 'moderate': return '#D97706';
    case 'high': return '#C2410C';
    case 'critical': return '#DC2626';
    default: return '#4F46E5';
  }
}

function setGaugeFill(fillId, pct, color) {
  const el = document.getElementById(fillId);
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const offset = GAUGE_PATH_LENGTH * (1 - clamped / 100);
  el.style.strokeDashoffset = offset;
  if (color) el.style.setProperty('--rsk-gauge-color', color);
}

function renderRiskGauge(score, level, successProbability) {
  const s = typeof score === 'number' ? score : 0;
  const color = colorForLevel(level);
  document.getElementById('riskScoreValue').textContent = s;
  setGaugeFill('riskGaugeFill', s, color);

  const badge = document.getElementById('riskLevelBadge');
  badge.textContent = level || '—';
  badge.className = `rsk-level-badge ${levelClass(level)}`;

  document.getElementById('successProbabilityText').textContent =
    typeof successProbability === 'number' ? `${successProbability}% estimated success probability` : '';
}

const CATEGORY_META = {
  businessRisk: { label: 'Business Risk' },
  financialRisk: { label: 'Financial Risk' },
  operationalRisk: { label: 'Operational Risk' },
  technicalRisk: { label: 'Technical Risk' },
};

function renderCategories(categories) {
  const grid = document.getElementById('categoryGrid');
  if (!categories) {
    grid.innerHTML = '';
    return;
  }
  grid.innerHTML = Object.keys(CATEGORY_META)
    .map((key) => {
      const cat = categories[key];
      if (!cat) return '';
      const color = colorForLevel(cat.level);
      const factors = (cat.factors || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
      return `
        <div class="rsk-category-card" style="--rsk-cat-color:${color};">
          <div class="rsk-category-head">
            <span class="rsk-category-name">${CATEGORY_META[key].label}</span>
            <span class="rsk-category-score">${cat.score ?? 0}</span>
          </div>
          <div class="rsk-category-track">
            <div class="rsk-category-fill" style="width:${cat.score || 0}%"></div>
          </div>
          <ul class="rsk-category-factors">${factors}</ul>
        </div>
      `;
    })
    .join('');
}

function renderSwot(swot) {
  if (!swot) return;
  renderList('strengthsList', swot.strengths);
  renderList('weaknessesList', swot.weaknesses);
  renderList('opportunitiesList', swot.opportunities);
  renderList('threatsList', swot.threats);
}

function verdictClass(verdict) {
  switch ((verdict || '').toLowerCase()) {
    case 'highly feasible': return { bg: 'var(--vrx-good-bg)', color: 'var(--vrx-good)' };
    case 'feasible': return { bg: '#EFF4FF', color: 'var(--vrx-info)' };
    case 'moderately feasible': return { bg: '#FFFBEB', color: '#B45309' };
    default: return { bg: 'var(--vrx-bad-bg)', color: 'var(--vrx-bad)' };
  }
}

const BREAKDOWN_META = {
  marketFeasibility: 'Market Feasibility',
  financialFeasibility: 'Financial Feasibility',
  operationalFeasibility: 'Operational Feasibility',
  technicalFeasibility: 'Technical Feasibility',
};

function renderFeasibility(feasibility) {
  if (!feasibility) return;
  const pct = typeof feasibility.overallPercentage === 'number' ? feasibility.overallPercentage : 0;
  document.getElementById('feasibilityValue').textContent = `${pct}%`;
  setGaugeFill('feasibilityGaugeFill', pct, 'var(--vrx-good)');

  const badge = document.getElementById('verdictBadge');
  const style = verdictClass(feasibility.verdict);
  badge.textContent = feasibility.verdict || '—';
  badge.style.background = style.bg;
  badge.style.color = style.color;

  document.getElementById('feasibilitySummary').textContent = feasibility.summary || '—';

  const bars = document.getElementById('breakdownBars');
  const breakdown = feasibility.breakdown || {};
  bars.innerHTML = Object.keys(BREAKDOWN_META)
    .map((key) => {
      const value = breakdown[key] || 0;
      return `
        <div class="rsk-breakdown-row">
          <span class="rsk-breakdown-label">${BREAKDOWN_META[key]}</span>
          <div class="rsk-breakdown-track">
            <div class="rsk-breakdown-fill" style="width:${value}%"></div>
          </div>
          <span class="rsk-breakdown-value">${value}</span>
        </div>
      `;
    })
    .join('');
}

function renderList(elementId, items) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<li>—</li>';
    return;
  }
  el.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}