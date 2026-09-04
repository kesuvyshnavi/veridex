// server/backend/public/js/dashboard.js
// Lists the logged-in user's own projects (GET /api/projects), shows a
// quick-glance status per engine (Market/Risk/Recommendations), and
// supports deleting a project with an inline two-step confirmation — no
// browser popups, same pattern as the profile menu's logout confirm.

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

const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const errorState = document.getElementById('errorState');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');
const projectGrid = document.getElementById('projectGrid');

function showOnly(el) {
  [loadingState, emptyState, errorState, projectGrid].forEach((node) => node.classList.add('hidden'));
  el.classList.remove('hidden');
}

async function loadProjects() {
  showOnly(loadingState);
  try {
    const res = await fetch('/api/projects', { credentials: 'same-origin' });
    const result = await res.json();

    if (!res.ok || !result.success) {
      errorText.textContent = result.message || 'Something went wrong while loading your projects.';
      showOnly(errorState);
      return;
    }

    if (!result.projects.length) {
      showOnly(emptyState);
      return;
    }

    renderGrid(result.projects);
    showOnly(projectGrid);
  } catch (err) {
    console.error('Failed to load projects:', err);
    errorText.textContent = 'Unable to reach the server. Please check your connection.';
    showOnly(errorState);
  }
}

retryBtn.addEventListener('click', loadProjects);

function scoreClass(score) {
  if (typeof score !== 'number') return '';
  if (score >= 70) return 'score-good';
  if (score >= 45) return 'score-mid';
  return 'score-bad';
}

function riskScoreClass(score) {
  // Risk score is inverted: LOWER is better.
  if (typeof score !== 'number') return '';
  if (score <= 35) return 'score-good';
  if (score <= 60) return 'score-mid';
  return 'score-bad';
}

function badge(label, isDone) {
  return `<span class="dsh-badge ${isDone ? 'dsh-badge-done' : 'dsh-badge-pending'}">${isDone ? '✓' : '—'} ${label}</span>`;
}

function renderGrid(projects) {
  projectGrid.innerHTML = projects.map((p) => renderCard(p)).join('');
  attachCardHandlers(projects);
}

function renderCard(p) {
  const tags = [p.industry, p.business_model, p.target_market, p.budget].filter(Boolean);
  const growthScore = p.market_analysis && p.market_analysis.growthPotential ? p.market_analysis.growthPotential.score : null;
  const riskScore = p.risk_analysis ? p.risk_analysis.overallRiskScore : null;

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

  document.querySelectorAll('[data-delete-trigger]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dsh-card');
      const actions = card.querySelector('[data-actions]');
      const projectId = card.getAttribute('data-project-id');

      // Step 1 -> Step 2: swap the action row for an inline confirmation,
      // same no-popup pattern as the profile menu's logout confirm.
      actions.innerHTML = `
        <div class="dsh-confirm-row">
          <span class="dsh-confirm-text">Delete this project?</span>
          <button type="button" class="dsh-confirm-yes" data-confirm-yes>Yes, delete</button>
          <button type="button" class="dsh-confirm-no" data-confirm-no>Cancel</button>
        </div>
      `;

      actions.querySelector('[data-confirm-yes]').addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          const result = await res.json();
          if (!res.ok || !result.success) {
            alert(result.message || 'Could not delete this project.');
            return;
          }
          card.remove();
          if (!document.querySelector('.dsh-card')) {
            showOnly(emptyState);
          }
        } catch (err) {
          console.error('Delete failed:', err);
          alert('Unable to reach the server. Please try again.');
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

loadProjects();