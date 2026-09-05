// server/backend/public/js/dashboard.js
// Lists the logged-in user's own projects (paginated via GET
// /api/projects?page=&limit=), shows a quick-glance status per engine,
// supports deleting a project, and lets the user CONTINUE an incomplete
// project — including RETRYING Market Intelligence itself if that step
// never completed at all (the stuck-project edge case), or continuing
// straight to Risk Assessment / Recommendations.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const PAGE_SIZE = 20;

const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const errorState = document.getElementById('errorState');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const projectGrid = document.getElementById('projectGrid');

let allProjects = [];
let currentPage = 1;
let hasMore = false;
let loadMoreBtn = null;

function showOnly(el) {
  [loadingState, emptyState, errorState, projectGrid].forEach((node) => node.classList.add('hidden'));
  el.classList.remove('hidden');
}

function ensureLoadMoreButton() {
  if (loadMoreBtn) return loadMoreBtn;
  loadMoreBtn = document.createElement('button');
  loadMoreBtn.type = 'button';
  loadMoreBtn.className = 'vrx-btn-secondary';
  loadMoreBtn.style.cssText = 'display:block;margin:20px auto 0;';
  loadMoreBtn.textContent = 'Load more projects';
  loadMoreBtn.addEventListener('click', () => loadProjects({ page: currentPage + 1, append: true }));
  projectGrid.insertAdjacentElement('afterend', loadMoreBtn);
  return loadMoreBtn;
}

async function loadProjects({ page = 1, append = false } = {}) {
  if (!append) {
    showOnly(loadingState);
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading…';
  }

  try {
    const res = await fetch(`/api/projects?page=${page}&limit=${PAGE_SIZE}`, { credentials: 'same-origin' });
    const result = await res.json();

    if (!res.ok || !result.success) {
      errorText.textContent = result.message || 'Something went wrong while loading your projects.';
      showOnly(errorState);
      return;
    }

    currentPage = page;
    hasMore = !!(result.pagination && result.pagination.hasMore);
    allProjects = append ? allProjects.concat(result.projects) : result.projects;

    if (!allProjects.length) {
      showOnly(emptyState);
      return;
    }

    renderGrid(allProjects);
    showOnly(projectGrid);

    const btn = ensureLoadMoreButton();
    btn.classList.toggle('hidden', !hasMore);
    btn.disabled = false;
    btn.textContent = 'Load more projects';
  } catch (err) {
    console.error('Failed to load projects:', err);
    errorText.textContent = 'Unable to reach the server. Please check your connection.';
    showOnly(errorState);
  }
}

retryBtn.addEventListener('click', () => loadProjects({ page: 1 }));

function scoreClass(score) {
  if (typeof score !== 'number') return '';
  if (score >= 70) return 'score-good';
  if (score >= 45) return 'score-mid';
  return 'score-bad';
}

function riskScoreClass(score) {
  if (typeof score !== 'number') return '';
  if (score <= 35) return 'score-good';
  if (score <= 60) return 'score-mid';
  return 'score-bad';
}

function badge(label, isDone) {
  return `<span class="dsh-badge ${isDone ? 'dsh-badge-done' : 'dsh-badge-pending'}">${isDone ? '✓' : '—'} ${label}</span>`;
}

// Figures out the single next action for a project:
// - Market Intelligence missing entirely -> retry Market Intelligence
//   (the stuck-project edge case: happens if the fallback generator
//   itself somehow also failed).
// - Risk Assessment missing -> continue to Risk Assessment.
// - Recommendations missing -> continue to Recommendations.
// - All three present -> no action needed.
function nextStepInfo(p) {
  if (!p.market_analysis) {
    return { kind: 'retry-market', label: 'Retry Market Analysis' };
  }
  if (!p.risk_analysis) {
    return { kind: 'navigate', targetPage: 'risk.html', label: 'Continue: Risk Assessment' };
  }
  if (!p.recommendations) {
    return { kind: 'navigate', targetPage: 'recommendations.html', label: 'Continue: Recommendations' };
  }
  return null;
}

function renderGrid(projects) {
  projectGrid.innerHTML = projects.map((p) => renderCard(p)).join('');
  attachCardHandlers(projects);
}

function renderCard(p) {
  const tags = [p.industry, p.business_model, p.target_market, p.budget].filter(Boolean);
  const growthScore = p.market_analysis && p.market_analysis.growthPotential ? p.market_analysis.growthPotential.score : null;
  const riskScore = p.risk_analysis ? p.risk_analysis.overallRiskScore : null;
  const nextStep = nextStepInfo(p);

  return `
    <div class="dsh-card" data-project-id="${p.id}">
      <div class="dsh-card-head">
        <h3 class="dsh-card-title">${escapeHtml(p.project_name)}</h3>
        <span class="dsh-card-date">${formatDate(p.created_at)}</span>
      </div>

      <div class="dsh-tag-row">
        ${tags.map((t) => `<span class="vrx-tag">${escapeHtml(t)}</span>`).join('')}
      </div>

      <div class="dsh-badge-row">
        ${badge('Market', !!p.market_analysis)}
        ${badge('Risk', !!p.risk_analysis)}
        ${badge('Recs', !!p.recommendations)}
      </div>

      ${
        growthScore !== null || riskScore !== null
          ? `<div class="dsh-score-row">
              ${
                growthScore !== null
                  ? `<div class="dsh-score-item">
                      <span class="dsh-score-label">Growth Potential</span>
                      <span class="dsh-score-value ${scoreClass(growthScore)}">${growthScore}/100</span>
                    </div>`
                  : ''
              }
              ${
                riskScore !== null
                  ? `<div class="dsh-score-item">
                      <span class="dsh-score-label">Risk Score</span>
                      <span class="dsh-score-value ${riskScoreClass(riskScore)}">${riskScore}/100</span>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }

      <div class="dsh-summary-panel hidden" data-summary-panel>
        ${renderSummaryContent(p)}
      </div>

      ${
        nextStep
          ? `<button type="button" class="dsh-btn-continue" data-continue-trigger>${escapeHtml(nextStep.label)} →</button>`
          : ''
      }

      <a href="report.html?id=${p.id}" class="vrx-btn-primary" style="text-align:center;justify-content:center;">View Full Report</a>

      <div class="dsh-card-actions" data-actions>
        <button type="button" class="dsh-btn" data-toggle-summary>View Summary</button>
        <button type="button" class="dsh-btn dsh-btn-danger" data-delete-trigger>Delete</button>
      </div>
    </div>
  `;
}

function renderSummaryContent(p) {
  const parts = [];

  if (p.market_analysis) {
    parts.push(
      `<p><span class="dsh-summary-label">Market:</span> ${escapeHtml(p.market_analysis.marketOverview || '—')}</p>`
    );
  }
  if (p.risk_analysis) {
    parts.push(
      `<p><span class="dsh-summary-label">Risk:</span> ${escapeHtml(p.risk_analysis.riskLevel || '—')} risk, ${escapeHtml(
        (p.risk_analysis.feasibility && p.risk_analysis.feasibility.verdict) || '—'
      )}</p>`
    );
  }
  if (p.recommendations && p.recommendations.recommendations && p.recommendations.recommendations[0]) {
    parts.push(
      `<p><span class="dsh-summary-label">Top recommendation:</span> ${escapeHtml(p.recommendations.recommendations[0].title)}</p>`
    );
  }
  if (!parts.length) {
    parts.push('<p>No analysis has been generated for this project yet.</p>');
  }

  return parts.join('');
}

async function retryMarketAnalysis(projectId, btn) {
  btn.disabled = true;
  btn.textContent = 'Retrying…';
  try {
    const res = await fetch(`/api/projects/${projectId}/retry-market-analysis`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      alert(result.message || 'Could not retry market analysis.');
      btn.disabled = false;
      btn.textContent = 'Retry Market Analysis →';
      return;
    }

    if (!result.analysis) {
      alert(result.analysisError || 'Market analysis is still unavailable. Please try again shortly.');
      btn.disabled = false;
      btn.textContent = 'Retry Market Analysis →';
      return;
    }

    await loadProjects({ page: 1 });
  } catch (err) {
    console.error('Failed to retry market analysis:', err);
    alert('Unable to reach the server. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Retry Market Analysis →';
  }
}

async function continueProject(projectId, targetPage, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
  }

  try {
    const res = await fetch(`/api/projects/${projectId}`, { credentials: 'same-origin' });
    const result = await res.json();

    if (!res.ok || !result.success) {
      alert(result.message || 'Could not load this project to continue.');
      return;
    }

    const full = result.project;
    const projectFields = {
      project_name: full.project_name,
      industry: full.industry,
      business_model: full.business_model,
      target_market: full.target_market,
      currency: full.currency,
      budget: full.budget,
      description: full.description,
    };

    sessionStorage.setItem(
      'veridexResult',
      JSON.stringify({
        projectId: full.id,
        submittedAt: full.created_at,
        project: projectFields,
        analysis: full.market_analysis || null,
        analysisError: full.market_analysis ? null : 'Market analysis is not available for this project.',
      })
    );

    if (full.risk_analysis) {
      sessionStorage.setItem(
        'veridexRiskResult',
        JSON.stringify({ analysis: full.risk_analysis, generatedAt: new Date().toISOString() })
      );
    } else {
      sessionStorage.removeItem('veridexRiskResult');
    }

    window.location.href = targetPage;
  } catch (err) {
    console.error('Failed to continue project:', err);
    alert('Unable to reach the server. Please try again.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Continue →';
    }
  }
}

function attachCardHandlers(projects) {
  document.querySelectorAll('[data-toggle-summary]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dsh-card');
      const panel = card.querySelector('[data-summary-panel]');
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      btn.textContent = isHidden ? 'Hide Summary' : 'View Summary';
    });
  });

  document.querySelectorAll('[data-continue-trigger]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dsh-card');
      const projectId = card.getAttribute('data-project-id');
      const project = projects.find((p) => String(p.id) === String(projectId));
      const nextStep = project ? nextStepInfo(project) : null;
      if (!nextStep) return;

      if (nextStep.kind === 'retry-market') {
        retryMarketAnalysis(projectId, btn);
      } else {
        continueProject(projectId, nextStep.targetPage, btn);
      }
    });
  });

  document.querySelectorAll('[data-delete-trigger]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dsh-card');
      const actions = card.querySelector('[data-actions]');
      const projectId = card.getAttribute('data-project-id');

      actions.innerHTML = `
        <div class="dsh-confirm-row">
          <span class="dsh-confirm-text">Delete this project?</span>
          <button type="button" class="dsh-confirm-yes" data-confirm-yes>Yes, delete</button>
          <button type="button" class="dsh-confirm-no" data-confirm-no>Cancel</button>
        </div>
      `;

      actions.querySelector('[data-confirm-yes]').addEventListener('click', async () => {
        const yesBtn = actions.querySelector('[data-confirm-yes]');
        if (yesBtn) yesBtn.disabled = true;
        try {
          const res = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const result = await res.json();

          if (!res.ok || !result.success) {
            console.error('Delete failed:', result.message);
            alert(result.message || 'Could not delete this project. It may belong to a different account.');
            if (yesBtn) yesBtn.disabled = false;
            return;
          }

          console.log(`Deleted project ${result.deletedId} from the database.`);
          await loadProjects({ page: 1 });
        } catch (err) {
          console.error('Delete failed:', err);
          alert('Unable to reach the server. Please try again.');
          if (yesBtn) yesBtn.disabled = false;
        }
      });

      actions.querySelector('[data-confirm-no]').addEventListener('click', () => {
        actions.innerHTML = `
          <button type="button" class="dsh-btn" data-toggle-summary>View Summary</button>
          <button type="button" class="dsh-btn dsh-btn-danger" data-delete-trigger>Delete</button>
        `;
        attachCardHandlers(projects);
      });
    });
  });
}

loadProjects({ page: 1 });