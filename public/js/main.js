// server/backend/public/js/main.js

// Landing on the Project Input page always starts a fresh session — any
// previously stored analysis (Market Intelligence + Risk Assessment) is
// cleared here so results.html / risk.html can't show stale data from an
// earlier project if the user navigates to them without resubmitting.
// Runs both on normal load and on back/forward-cache restores (pageshow),
// since bfcache restores a page without re-running its top-level scripts.
function clearPreviousAnalysis() {
  sessionStorage.removeItem('veridexResult');
}
clearPreviousAnalysis();
window.addEventListener('pageshow', clearPreviousAnalysis);

const form = document.getElementById('projectForm');
const submitBtn = document.getElementById('submitBtn');
const formErrorBox = document.getElementById('formErrorBox');

const statusBox = document.getElementById('statusBox');
const stepSubmit = document.getElementById('stepSubmit');
const stepAnalyze = document.getElementById('stepAnalyze');
const statusComplete = document.getElementById('statusComplete');
const statusCompleteText = document.getElementById('statusCompleteText');
const viewAnalysisBtn = document.getElementById('viewAnalysisBtn');

const currencySelect = document.getElementById('currency');
const budgetSelect = document.getElementById('budget');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Budget range options per currency. Keeping these as data (rather than
// hardcoded <option> tags in index.html) means the Budget dropdown can be
// repopulated instantly whenever the person changes Currency, without a
// page reload or a server round-trip.
const BUDGET_RANGES_BY_CURRENCY = {
  INR: [
    'Under ₹5L',
    '₹5L - ₹25L',
    '₹25L - ₹1Cr',
    '₹1Cr - ₹5Cr',
    'Above ₹5Cr',
  ],
  USD: [
    'Under $10K',
    '$10K - $50K',
    '$50K - $250K',
    '$250K - $1M',
    'Above $1M',
  ],
  EUR: [
    'Under €10K',
    '€10K - €50K',
    '€50K - €250K',
    '€250K - €1M',
    'Above €1M',
  ],
  GBP: [
    'Under £10K',
    '£10K - £50K',
    '£50K - £250K',
    '£250K - £1M',
    'Above £1M',
  ],
  AED: [
    'Under AED 50K',
    'AED 50K - AED 250K',
    'AED 250K - AED 1M',
    'AED 1M - AED 5M',
    'Above AED 5M',
  ],
};

// Rebuilds the Budget dropdown's options to match the selected currency.
// Tries to preserve the person's previous selection if the same *position*
// (e.g. "3rd bracket") exists for the new currency, otherwise resets it.
function populateBudgetOptions(currencyCode) {
  const ranges = BUDGET_RANGES_BY_CURRENCY[currencyCode] || BUDGET_RANGES_BY_CURRENCY.INR;
  const previousIndex = Array.from(budgetSelect.options).findIndex(
    (opt) => opt.value === budgetSelect.value
  );

  budgetSelect.innerHTML =
    '<option value="">-- Select Budget Range --</option>' +
    ranges.map((range) => `<option value="${range}">${range}</option>`).join('');

  // previousIndex 0 is the placeholder; only restore a real prior selection.
  if (previousIndex > 0 && previousIndex <= ranges.length) {
    budgetSelect.selectedIndex = previousIndex;
  }
}

// Initialize the Budget dropdown for whatever Currency is selected by
// default, and keep it in sync whenever Currency changes.
populateBudgetOptions(currencySelect.value);
currencySelect.addEventListener('change', () => {
  populateBudgetOptions(currencySelect.value);
});

// If we arrived here via "Edit Details" on results.html/risk.html, pull the
// previously submitted fields back into the form. Must run after the budget
// dropdown init above so populateBudgetOptions() exists to rebuild ranges
// for the restored currency before we set the budget value itself.
(function prefillFromEdit() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('edit') !== 'true') return;

  const raw = sessionStorage.getItem('veridexEditData');
  if (!raw) return;

  let editData;
  try {
    editData = JSON.parse(raw);
  } catch (err) {
    return;
  } finally {
    sessionStorage.removeItem('veridexEditData');
  }

  document.getElementById('project_name').value = editData.project_name || '';
  document.getElementById('industry').value = editData.industry || '';
  document.getElementById('business_model').value = editData.business_model || '';
  document.getElementById('target_market').value = editData.target_market || '';
  currencySelect.value = editData.currency || 'INR';
  populateBudgetOptions(currencySelect.value); // rebuild ranges for the restored currency
  budgetSelect.value = editData.budget || '';
  document.getElementById('description').value = editData.description || '';

  const subtitle = document.querySelector('.page-subtitle');
  if (subtitle) {
    subtitle.textContent =
      'Editing your previous submission — update the fields and click Analyze Project to regenerate the report.';
  }
})();

// Clears all field-level error messages
function clearErrors() {
  document.querySelectorAll('.error-msg').forEach((el) => (el.textContent = ''));
  formErrorBox.classList.add('hidden');
  formErrorBox.textContent = '';
}

// Basic client-side validation (mirrors backend validation)
function validateForm(data) {
  const errors = {};

  if (!data.project_name || data.project_name.trim().length < 2) {
    errors.project_name = 'Project name must be at least 2 characters long.';
  }
  if (!data.industry) {
    errors.industry = 'Please select an industry/sector.';
  }
  if (!data.business_model) {
    errors.business_model = 'Please select a business model.';
  }
  if (!data.target_market) {
    errors.target_market = 'Please select a target market.';
  }
  if (!data.currency) {
    errors.currency = 'Please select a currency.';
  }
  if (!data.budget) {
    errors.budget = 'Please select a budget range.';
  }
  if (!data.description || data.description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters long.';
  }

  return errors;
}

function showFieldErrors(errors) {
  Object.keys(errors).forEach((field) => {
    const errEl = document.getElementById(`err_${field}`);
    if (errEl) errEl.textContent = errors[field];
  });
}

// ---- Status flow helpers ----
// A step's state is one of: pending (default), 'active', 'done', 'warn'
function setStepState(stepEl, state, text) {
  stepEl.classList.remove('is-active', 'is-done', 'is-warn');
  if (state) stepEl.classList.add(`is-${state}`);
  if (text) {
    stepEl.querySelector('.status-step-text').textContent = text;
  }
}

function resetStatusFlow() {
  statusBox.classList.remove('hidden');
  statusComplete.classList.add('hidden');
  setStepState(stepSubmit, 'active', 'Submitting your project…');
  setStepState(stepAnalyze, null, 'Analysing market & competitors…');
}

function hideStatusFlow() {
  statusBox.classList.add('hidden');
  statusComplete.classList.add('hidden');
}

function setFormDisabled(isDisabled) {
  submitBtn.disabled = isDisabled;
  Array.from(form.elements).forEach((el) => (el.disabled = isDisabled));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  hideStatusFlow();

  const formData = {
    project_name: document.getElementById('project_name').value.trim(),
    industry: document.getElementById('industry').value,
    business_model: document.getElementById('business_model').value,
    target_market: document.getElementById('target_market').value,
    currency: document.getElementById('currency').value,
    budget: document.getElementById('budget').value,
    description: document.getElementById('description').value.trim(),
  };

  // Step 1: Client-side validation
  const errors = validateForm(formData);
  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    return;
  }

  try {
    setFormDisabled(true);
    resetStatusFlow();

    // Backend does both the DB insert and the AI analysis in one request,
    // so "submitted" and "analysing" are really two phases of the same
    // network call. We reflect that honestly to the user: the "submitted"
    // step completes only once the server confirms the save, and the
    // "analysing" step is marked active immediately after — not before.
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      hideStatusFlow();
      if (result.errors) {
        formErrorBox.textContent = result.errors.join(' ');
      } else {
        formErrorBox.textContent = result.message || 'Something went wrong. Please try again.';
      }
      formErrorBox.classList.remove('hidden');
      return;
    }

    // Project saved successfully.
    setStepState(stepSubmit, 'done', 'Form submitted successfully');
    setStepState(stepAnalyze, 'active', 'Analysing market & competitors…');

    // Stash the project details + analysis so results.html can render the
    // full report once the user chooses to view it.
    const payload = {
      projectId: result.projectId,
      submittedAt: new Date().toISOString(),
      project: formData,
      analysis: result.analysis || null,
      analysisError: result.analysisError || null,
    };
    sessionStorage.setItem('veridexResult', JSON.stringify(payload));

    // Small pause so the "analysing" step is visible rather than flashing
    // instantly — the analysis itself already completed server-side.
    await wait(700);

    if (result.analysisError) {
      setStepState(stepAnalyze, 'warn', 'Analysis unavailable — showing estimated figures');
      statusCompleteText.textContent = 'Your project was saved. View the report for estimated figures.';
    } else {
      setStepState(stepAnalyze, 'done', 'Completed analysing the data');
      statusCompleteText.textContent = 'Your report is ready.';
    }

    statusComplete.classList.remove('hidden');
  } catch (err) {
    console.error('Request failed:', err);
    hideStatusFlow();
    formErrorBox.textContent = 'Unable to reach the server. Please check your connection.';
    formErrorBox.classList.remove('hidden');
  } finally {
    setFormDisabled(false);
  }
});

viewAnalysisBtn.addEventListener('click', () => {
  window.location.href = 'results.html';
});