// server/backend/public/js/forgot-password.js
const form = document.getElementById('forgotForm');
const submitBtn = document.getElementById('submitBtn');
const formErrorBox = document.getElementById('formErrorBox');
const formSuccessBox = document.getElementById('formSuccessBox');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formErrorBox.classList.add('hidden');
  formSuccessBox.classList.add('hidden');
  document.getElementById('err_email').textContent = '';

  const email = document.getElementById('email').value.trim();
  if (!email) {
    document.getElementById('err_email').textContent = 'Email is required.';
    return;
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await res.json();

    formSuccessBox.textContent = result.message || 'If an account exists for that email, a reset link has been sent.';
    formSuccessBox.classList.remove('hidden');
    form.reset();
  } catch (err) {
    formErrorBox.textContent = 'Unable to reach the server. Please check your connection and try again.';
    formErrorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
});