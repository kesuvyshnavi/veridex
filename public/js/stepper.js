// server/backend/public/js/stepper.js
// Computes the real state of each of the 3 progress steps from
// sessionStorage (not from which page you happen to be on), and exposes
// window.VeridexStepper.setStep() so a page can flip its OWN step to
// "done" only once its own async work has actually finished — used by
// risk.js, since the risk/SWOT/feasibility analysis is fetched live on
// that page rather than already sitting in sessionStorage.
//
// Placed as a script tag right after the progress bar markup in each
// page, so it runs synchronously before the bar is painted (avoids a
// flash of the wrong state).

(function () {
  const page = document.body.getAttribute('data-page'); // 'input' | 'results' | 'risk'

  const raw = sessionStorage.getItem('veridexResult');
  let hasProject = false;
  let hasMarketAnalysis = false;

  if (raw) {
    hasProject = true;
    try {
      const data = JSON.parse(raw);
      hasMarketAnalysis = !!(data && data.analysis);
    } catch (err) {
      hasProject = false;
    }
  }

  function applyState(stepNumber, state) {
    const li = document.getElementById('navStep' + stepNumber);
    if (!li) return;
    li.classList.remove('is-done', 'is-active', 'is-pending', 'is-warn');
    li.classList.add('is-' + state);
    const circle = li.querySelector('.vrx-progress-circle');
    if (circle) {
      circle.textContent = state === 'done' ? '✓' : circle.dataset.num;
    }
  }

  if (page === 'input') {
    applyState(1, 'active');
    applyState(2, 'pending');
    applyState(3, 'pending');
  } else if (page === 'results') {
    applyState(1, hasProject ? 'done' : 'pending');
    applyState(2, !hasProject ? 'pending' : hasMarketAnalysis ? 'done' : 'warn');
    applyState(3, 'pending');
  } else if (page === 'risk') {
    applyState(1, hasProject ? 'done' : 'pending');
    applyState(2, !hasProject ? 'pending' : hasMarketAnalysis ? 'done' : 'warn');
    applyState(3, 'active'); // flipped to 'done' / 'warn' by risk.js once its fetch resolves
  }

  // Exposed so risk.js can mark step 3 done/warn only once the live
  // risk-analysis request actually finishes, rather than the moment the
  // page loads.
  window.VeridexStepper = { setStep: applyState };
})();