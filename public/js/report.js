// server/backend/public/js/report.js
// Renders the consolidated "Comprehensive Assessment Report" for a single
// project, read entirely from the DB (GET /api/projects/:id) — no
// sessionStorage, no live Groq calls. Reuses the same render patterns and
// CSS classes as results.js/risk.js/recommendation.js for visual
// consistency, adapted to read from project.market_analysis /
// project.risk_analysis / project.recommendations directly.
//
// Milestone 4 addition: "Share" streams the server-generated PDF
// (GET /api/projects/:id/pdf) into a File and hands it to the native Web
// Share sheet on supported devices (mobile), falling back to a plain
// download on desktop browsers that don't support file sharing.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const reportRoot = document.getElementById('reportRoot');

const projectId = getProjectIdFromUrl();
if (!projectId) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
} else {
  loadProject(projectId);
}

async function loadProject(id) {
  try {
    const res = await fetch(`/api/projects/${id}`, { credentials: 'same-origin' });
    const result = await res.json();

    loadingState.classList.add('hidden');

    if (!res.ok || !result.success) {
      document.getElementById('errorText').textContent = result.message || 'This report could not be found.';
      errorState.classList.remove('hidden');
      return;
    }

    reportRoot.classList.remove('hidden');
    render(result.project);
  } catch (err) {
    console.error('Failed to load project:', err);
    loadingState.classList.add('hidden');
    document.getElementById('errorText').textContent = 'Unable to reach the server. Please try again.';
    errorState.classList.remove('hidden');
  }
}

function render(project) {
  document.getElementById('projectName').textContent = project.project_name || 'Untitled Project';
  const tagRow = document.getElementById('tagRow');
  [project.industry, project.business_model, project.target_market, project.budget]
    .filter(Boolean)
    .forEach((t) => {
      const span = document.createElement('span');
      span.className = 'vrx-tag';
      span.textContent = t;
      tagRow.appendChild(span);
    });

  document.getElementById('downloadPdfBtn').href = `/api/projects/${project.id}/pdf`;
  wireShareButton(project.id, project.project_name);

  renderMarket(project.market_analysis);
  renderRisk(project.risk_analysis);
  renderRecommendations(project.recommendations);
}

// ---------- Share button: native share sheet with desktop-download fallback ----------
function wireShareButton(id, projectName) {
  const btn = document.getElementById('sharePdfBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Preparing…';

    try {
      const res = await fetch(`/api/projects/${id}/pdf`, { credentials: 'same-origin' });
      const blob = await res.blob();
      const filename = `${(projectName || 'veridex-report').replace(/[^a-z0-9]/gi, '_')}_veridex_report.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Veridex Report — ${projectName || 'Project'}`,
        });
      } else {
        // Desktop browsers without native file sharing: fall back to a
        // plain download so the button still does something useful.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // AbortError fires when the user just closes the native share sheet
      // without picking anything — not a real failure, so stay silent.
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
        alert('Could not share the report. Please try Download PDF instead.');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
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

// ---------- Section 01: Market ----------
function renderMarket(analysis) {
  if (!analysis) {
    document.getElementById('marketSectionEmpty').classList.remove('hidden');
    document.getElementById('marketSectionBody').classList.add('hidden');
    return;
  }

  document.getElementById('marketOverview').textContent = analysis.marketOverview || '—';

  const grid = document.getElementById('metricsGrid');
  const ms = analysis.marketSize || {};
  const items = [
    { label: 'TAM', value: ms.tam, dot: '#4F46E5' },
    { label: 'SAM', value: ms.sam, dot: '#2563EB' },
    { label: 'SOM', value: ms.som, dot: '#16A34A' },
    { label: 'Growth Rate', value: ms.growthRate, dot: '#D97706' },
  ];
  grid.innerHTML = items
    .map(
      (item) => `
      <div class="vrx-metric-card">
        <span class="vrx-metric-dot" style="background:${item.dot}"></span>
        <span class="vrx-metric-label">${item.label}</span>
        <span class="vrx-metric-value">${escapeHtml(item.value || '—')}</span>
      </div>`
    )
    .join('');

  const compGrid = document.getElementById('competitorGrid');
  compGrid.innerHTML = (analysis.competitors || [])
    .map(
      (c) => `
      <div class="vrx-competitor-card">
        <div class="vrx-competitor-card-header">
          <span class="vrx-competitor-name">${escapeHtml(c.name)}</span>
          <span class="vrx-badge vrx-badge-info">${escapeHtml(c.position || '')}</span>
        </div>
        <div class="vrx-share-row">
          <div class="vrx-share-track"><div class="vrx-share-fill" style="width:${c.marketShare || 0}%"></div></div>
          <span class="vrx-share-value">${c.marketShare || 0}% share</span>
        </div>
      </div>`
    )
    .join('');

  const score = analysis.growthPotential ? analysis.growthPotential.score : 0;
  const circle = document.getElementById('growthScoreCircle');
  document.getElementById('growthScoreValue').textContent = score;
  circle.style.setProperty('--score', score);
  circle.classList.add(score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low');
  document.getElementById('growthSummary').textContent = (analysis.growthPotential && analysis.growthPotential.summary) || '—';

  renderList('challengesList', analysis.industryChallenges);
  renderList('opportunitiesList', analysis.opportunities);
}

// ---------- Section 02: Risk ----------
function colorForLevel(level) {
  switch ((level || '').toLowerCase()) {
    case 'low': return '#16A34A';
    case 'moderate': return '#D97706';
    case 'high': return '#C2410C';
    case 'critical': return '#DC2626';
    default: return '#4F46E5';
  }
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

function renderRisk(analysis) {
  if (!analysis) {
    document.getElementById('riskSectionEmpty').classList.remove('hidden');
    document.getElementById('riskSectionBody').classList.add('hidden');
    return;
  }

  const badge = document.getElementById('riskLevelBadge');
  badge.textContent = `${analysis.riskLevel || '—'} risk (${analysis.overallRiskScore ?? 0}/100)`;
  badge.className = `rsk-level-badge ${levelClass(analysis.riskLevel)}`;
  document.getElementById('riskScoreText').textContent =
    typeof analysis.successProbability === 'number' ? `${analysis.successProbability}% estimated success probability` : '';

  const grid = document.getElementById('categoryGrid');
  const categories = analysis.riskCategories || {};
  const labels = { businessRisk: 'Business Risk', financialRisk: 'Financial Risk', operationalRisk: 'Operational Risk', technicalRisk: 'Technical Risk' };
  grid.innerHTML = Object.keys(labels)
    .map((key) => {
      const cat = categories[key];
      if (!cat) return '';
      const color = colorForLevel(cat.level);
      const factors = (cat.factors || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
      return `
        <div class="rsk-category-card" style="--rsk-cat-color:${color};">
          <div class="rsk-category-head">
            <span class="rsk-category-name">${labels[key]}</span>
            <span class="rsk-category-score">${cat.score ?? 0}</span>
          </div>
          <div class="rsk-category-track"><div class="rsk-category-fill" style="width:${cat.score || 0}%"></div></div>
          <ul class="rsk-category-factors">${factors}</ul>
        </div>`;
    })
    .join('');

  const swot = analysis.swot || {};
  renderList('strengthsList', swot.strengths);
  renderList('weaknessesList', swot.weaknesses);
  renderList('swotOpportunitiesList', swot.opportunities);
  renderList('threatsList', swot.threats);

  const feas = analysis.feasibility;
  if (feas) {
    document.getElementById('verdictBadge').textContent = `${feas.verdict || '—'} (${feas.overallPercentage ?? 0}%)`;
    document.getElementById('feasibilitySummary').textContent = feas.summary || '—';
  }
}

// ---------- Section 03: Recommendations ----------
function priorityBorderClass(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return 'rec-card-critical';
    case 'high': return 'rec-card-high';
    case 'medium': return 'rec-card-medium';
    default: return 'rec-card-low';
  }
}

function priorityBadgeClass(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return 'rec-badge-critical';
    case 'high': return 'rec-badge-high';
    case 'medium': return 'rec-badge-medium';
    default: return 'rec-badge-low';
  }
}

function impactBorderClass(impact) {
  switch ((impact || '').toLowerCase()) {
    case 'high': return 'rec-card-high';
    case 'medium': return 'rec-card-medium';
    default: return 'rec-card-low';
  }
}

function impactBadgeClass(impact) {
  switch ((impact || '').toLowerCase()) {
    case 'high': return 'rec-badge-high';
    case 'medium': return 'rec-badge-medium';
    default: return 'rec-badge-low';
  }
}

function renderRecommendations(report) {
  if (!report) {
    document.getElementById('recSectionEmpty').classList.remove('hidden');
    document.getElementById('recSectionBody').classList.add('hidden');
    return;
  }

  const recPanel = document.getElementById('recommendationsPanel');
  recPanel.innerHTML = (report.recommendations || [])
    .map(
      (item, i) => `
      <div class="rec-card ${priorityBorderClass(item.priority)}">
        <div class="rec-card-head">
          <span class="rec-card-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="rec-badge ${priorityBadgeClass(item.priority)}">${escapeHtml(item.priority || '—')}</span>
        </div>
        <span class="rec-card-title">${escapeHtml(item.title)}</span>
        <p class="rec-card-body">${escapeHtml(item.rationale || '')}</p>
      </div>`
    )
    .join('') || '<p>—</p>';

  const mitPanel = document.getElementById('mitigationPanel');
  mitPanel.innerHTML = (report.riskMitigation || [])
    .map(
      (item, i) => `
      <div class="rec-card ${impactBorderClass(item.impact)}">
        <div class="rec-card-head">
          <span class="rec-card-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="rec-badge ${impactBadgeClass(item.impact)}">${escapeHtml(item.impact || '—')} impact</span>
        </div>
        <span class="rec-card-title">${escapeHtml(item.risk)}</span>
        <p class="rec-card-body">${escapeHtml(item.strategy || '')}</p>
      </div>`
    )
    .join('') || '<p>—</p>';
}