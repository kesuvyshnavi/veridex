// server/backend/public/js/results.js
// Renders the "Market & Competitor Intelligence Engine" report for the most
// recently submitted project (handed off from main.js via sessionStorage).
//
// The engine has three capabilities, and this file renders each as its own
// section on the page:
//   01. Target Market Characteristics  -> marketCharacteristics + marketSize
//   02. Key Competitors & Industry Challenges -> competitors + industryChallenges
//   03. Market Opportunities & Growth Potential -> opportunities + growthPotential

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatFieldLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAnalyzedDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const emptyState = document.getElementById('emptyState');
const reportRoot = document.getElementById('reportRoot');

const raw = sessionStorage.getItem('veridexResult');

let currentProjectData = null;

if (!raw) {
  emptyState.classList.remove('hidden');
} else {
  try {
    currentProjectData = JSON.parse(raw);
    reportRoot.classList.remove('hidden');
    renderReport(currentProjectData);
  } catch (err) {
    console.error('Failed to parse stored result:', err);
    reportRoot.classList.add('hidden');
    emptyState.classList.remove('hidden');
  }
}

// "Edit Details" -> stash just the project fields (not the analysis) under a
// separate key and send the user back to the input form to fix them.
const editDetailsBtn = document.getElementById('editDetailsBtn');
if (editDetailsBtn) {
  editDetailsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentProjectData || !currentProjectData.project) return;
    sessionStorage.setItem('veridexEditData', JSON.stringify(currentProjectData.project));
    window.location.href = 'index.html?edit=true';
  });
}

function renderReport(data) {
  const { project, analysis, analysisError, submittedAt } = data;

  // ---- Meta header (project identity, sector, analysis date) ----
  document.getElementById('projectName').textContent = project.project_name || 'Untitled Project';
  document.getElementById('metaSector').textContent = project.industry || '—';
  document.getElementById('metaModel').textContent = project.business_model || '—';
  document.getElementById('metaDate').textContent = formatAnalyzedDate(submittedAt);

  const tagRow = document.getElementById('tagRow');
  const tags = [project.industry, project.business_model, project.target_market, project.budget];
  tagRow.innerHTML = tags
    .filter(Boolean)
    .map((t) => `<span class="vrx-tag">${escapeHtml(t)}</span>`)
    .join('');

  // ---- No analysis available: show a single notice, hide the three engine sections ----
  if (!analysis) {
    const notice = document.getElementById('noAnalysisNotice');
    document.getElementById('noAnalysisText').textContent =
      analysisError || 'Analysis is not available for this project yet.';
    notice.classList.remove('hidden');
    document.getElementById('capabilitiesRoot').classList.add('hidden');
    return;
  }

  if (analysis.isFallback) {
    document.getElementById('fallbackBanner').classList.remove('hidden');
  }

  // ---- Capability 01: Target Market Characteristics ----
  document.getElementById('marketOverview').textContent = analysis.marketOverview || '—';
  renderMetrics(analysis.marketSize);
  renderTrajectoryBars(analysis.historicalGrowth, analysis.marketSize);
  renderCharacteristics(analysis.marketCharacteristics);

  // ---- Capability 02: Key Competitors & Industry Challenges ----
  renderCompetitors(analysis.competitors || []);
  renderList('challengesList', analysis.industryChallenges);

  // ---- Capability 03: Market Opportunities & Growth Potential ----
  renderGrowthPotential(analysis.growthPotential, analysis.readinessScores);
  renderList('opportunitiesList', analysis.opportunities);
  renderList('suggestionsList', analysis.suggestions);
}

function renderMetrics(marketSize) {
  const grid = document.getElementById('metricsGrid');
  if (!marketSize) {
    grid.innerHTML = '';
    return;
  }
  const items = [
    { label: 'Total Addressable Market', value: marketSize.tam, dot: '#4F46E5' },
    { label: 'Serviceable Available Market', value: marketSize.sam, dot: '#2563EB' },
    { label: 'Serviceable Obtainable Market', value: marketSize.som, dot: '#16A34A' },
    { label: 'Growth Rate', value: marketSize.growthRate, dot: '#D97706' },
  ];
  grid.innerHTML = items
    .map(
      (item) => `
      <div class="vrx-metric-card">
        <span class="vrx-metric-dot" style="background:${item.dot}"></span>
        <span class="vrx-metric-label">${escapeHtml(item.label)}</span>
        <span class="vrx-metric-value">${escapeHtml(item.value || '—')}</span>
      </div>
    `
    )
    .join('');
}

// ---- Historical growth helpers: keep the trend useful even when the AI
// response doesn't include clean year-by-year data (which happens on live
// calls). The bars show the past 5 years of market size leading up to
// today, ending at (roughly) marketSize.tam — NOT a forward projection. ----

function normalizeTrajectory(trajectory) {
  return (Array.isArray(trajectory) ? trajectory : [])
    .map((p) => ({ year: p && p.year, value: Number(p && p.value) }))
    .filter((p) => p.year != null && !Number.isNaN(p.value) && p.value >= 0);
}

// Pulls the leading number out of strings like "₹18,500 Cr", "$5.0M", "92".
function parseMagnitude(str) {
  if (!str) return null;
  const match = String(str).match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ''));
  return Number.isNaN(value) ? null : value;
}

// Pulls the unit suffix out of strings like "₹18,500 Cr" -> "Cr", "$5.0M" -> "M".
function extractUnitSuffix(str) {
  if (!str) return '';
  const match = String(str).match(/[^\d.,\s₹$]+$/);
  return match ? match[0].trim() : '';
}

// Pulls a percentage out of strings like "11.3% YoY" -> 11.3. Falls back to
// a conservative industry-average default if none is present.
function parseGrowthRatePercent(str) {
  const match = str && String(str).match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : 12;
}

// Builds a 5-year HISTORICAL series ending at marketSize.tam, working
// backwards using the growth rate — used only if the AI omitted or
// malformed historicalGrowth (e.g. a live Groq call that skipped the field).
function synthesizeTrajectory(marketSize) {
  const tam = marketSize ? parseMagnitude(marketSize.tam) : null;
  const growth = marketSize ? parseGrowthRatePercent(marketSize.growthRate) : 12;
  const unitSuffix = marketSize ? extractUnitSuffix(marketSize.tam) : '';
  const yearlyGrowth = 1 + growth / 100;
  const endValue = tam && tam > 0 ? tam : 100;

  const values = [];
  let running = endValue;
  for (let i = 0; i < 5; i++) {
    values.unshift(Math.round(running));
    running = running / yearlyGrowth;
  }

  const currentYear = new Date().getFullYear();
  const points = values.map((value, i) => ({ year: currentYear - 4 + i, value }));
  return { points, unitSuffix };
}

// Renders the market-size trend as a simple, dependency-free set of
// horizontal bars (one per year) with a year-over-year % delta badge.
// Replaces the previous Chart.js line chart, which could silently render
// blank if the CDN script failed to load or its container had collapsed
// to 0 height at creation time.
function renderTrajectoryBars(rawTrajectory, marketSize) {
  const container = document.getElementById('trajectoryBars');
  const note = document.getElementById('trajectoryNote');
  if (!container) return;

  let points = normalizeTrajectory(rawTrajectory);
  let unitSuffix = extractUnitSuffix(marketSize && marketSize.tam);
  let isDerived = false;

  // Need at least 2 points to show a meaningful trend.
  if (points.length < 2) {
    const synthesized = synthesizeTrajectory(marketSize);
    points = synthesized.points;
    unitSuffix = synthesized.unitSuffix || unitSuffix;
    isDerived = true;
  }

  if (note) {
    if (isDerived) {
      note.textContent =
        'Estimated history, derived from current market size & growth rate — this AI run did not return year-by-year figures.';
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  const maxValue = Math.max(...points.map((p) => p.value), 1);

  container.innerHTML = points
    .map((p, i) => {
      const pct = Math.max(4, Math.round((p.value / maxValue) * 100));
      const prev = points[i - 1];
      let deltaHtml;
      if (prev && prev.value > 0) {
        const deltaPct = ((p.value - prev.value) / prev.value) * 100;
        const sign = deltaPct >= 0 ? '+' : '';
        const deltaClass = deltaPct >= 0 ? 'vrx-trend-delta-up' : 'vrx-trend-delta-down';
        deltaHtml = `<span class="vrx-trend-delta ${deltaClass}">${sign}${deltaPct.toFixed(1)}%</span>`;
      } else {
        deltaHtml = `<span class="vrx-trend-delta vrx-trend-delta-neutral">base</span>`;
      }

      return `
        <div class="vrx-trend-row">
          <span class="vrx-trend-year">${escapeHtml(p.year)}</span>
          <div class="vrx-trend-track">
            <div class="vrx-trend-fill" style="width:${pct}%"></div>
          </div>
          <span class="vrx-trend-value">${escapeHtml(p.value)}${unitSuffix ? ' ' + escapeHtml(unitSuffix) : ''}</span>
          ${deltaHtml}
        </div>
      `;
    })
    .join('');
}

function renderGrowthPotential(growthPotential, readinessScores) {
  const score = growthPotential && typeof growthPotential.score === 'number' ? growthPotential.score : 0;
  const circle = document.getElementById('growthScoreCircle');
  document.getElementById('growthScoreValue').textContent = score;
  circle.style.setProperty('--score', score);
  circle.classList.remove('score-high', 'score-mid', 'score-low');
  circle.classList.add(score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low');

  document.getElementById('growthSummary').textContent =
    (growthPotential && growthPotential.summary) || 'No growth summary available.';

  const bars = document.getElementById('readinessBars');
  if (!readinessScores) {
    bars.innerHTML = '';
    return;
  }

  bars.innerHTML = Object.keys(readinessScores)
    .map((key) => {
      const value = readinessScores[key];
      return `
        <div class="vrx-readiness-row">
          <span class="vrx-readiness-label">${escapeHtml(formatFieldLabel(key))}</span>
          <div class="vrx-readiness-track">
            <div class="vrx-readiness-fill" style="width:${value}%"></div>
          </div>
          <span class="vrx-readiness-value">${value}</span>
        </div>
      `;
    })
    .join('');
}

function renderCharacteristics(characteristics) {
  if (!characteristics) return;
  document.getElementById('audienceProfile').textContent = characteristics.targetAudienceProfile || '—';

  const maturityEl = document.getElementById('marketMaturity');
  maturityEl.textContent = characteristics.marketMaturity || '—';
  maturityEl.className = 'vrx-badge ' + maturityBadgeClass(characteristics.marketMaturity);

  const list = document.getElementById('keyDriversList');
  list.innerHTML = (characteristics.keyDrivers || [])
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join('');
}

function maturityBadgeClass(maturity) {
  switch (maturity) {
    case 'Emerging':
      return 'vrx-badge-info';
    case 'Growing':
      return 'vrx-badge-good';
    case 'Mature':
      return 'vrx-badge-neutral';
    case 'Declining':
      return 'vrx-badge-warn';
    default:
      return 'vrx-badge-neutral';
  }
}

function positionBadgeClass(position) {
  switch (position) {
    case 'Leader':
      return 'vrx-badge-warn';
    case 'Direct':
      return 'vrx-badge-info';
    case 'Indirect':
      return 'vrx-badge-neutral';
    default:
      return 'vrx-badge-neutral';
  }
}

function renderCompetitors(competitors) {
  const grid = document.getElementById('competitorGrid');
  grid.innerHTML = competitors
    .map(
      (c) => `
      <div class="vrx-competitor-card">
        <div class="vrx-competitor-card-header">
          <span class="vrx-competitor-name">${escapeHtml(c.name)}</span>
          <span class="vrx-badge ${positionBadgeClass(c.position)}">${escapeHtml(c.position || '')}</span>
        </div>
        <div class="vrx-share-row">
          <div class="vrx-share-track">
            <div class="vrx-share-fill" style="width:${c.marketShare || 0}%"></div>
          </div>
          <span class="vrx-share-value">${c.marketShare || 0}% share</span>
        </div>
        <div class="vrx-competitor-meta">
          <div><span class="vrx-field-label">Strength</span><p>${escapeHtml(c.strength || '—')}</p></div>
          <div><span class="vrx-field-label">Weakness</span><p>${escapeHtml(c.weakness || '—')}</p></div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderList(elementId, items) {
  const el = document.getElementById(elementId);
  if (!items || !items.length) {
    el.innerHTML = '<li>—</li>';
    return;
  }
  el.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}